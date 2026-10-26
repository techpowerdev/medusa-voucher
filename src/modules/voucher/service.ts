import { SqlEntityManager } from "@medusajs/framework/mikro-orm/knex"
import { Context } from "@medusajs/framework/types"
import {
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  generateEntityId,
  MedusaError,
  MedusaService,
} from "@medusajs/framework/utils"
import {
  ALLOCATION_FAILURE_RESOLVED_BY_SYSTEM,
  AllocationFailureStatus,
  DeliveryChannel,
  DeliveryStatus,
  VoucherImportProblemCode,
  VoucherStatus,
} from "./constants"
import VoucherAllocationFailure from "./models/voucher-allocation-failure"
import Voucher from "./models/voucher"
import VoucherAllocation from "./models/voucher-allocation"
import VoucherBatch from "./models/voucher-batch"
import VoucherDelivery from "./models/voucher-delivery"
import VoucherProduct from "./models/voucher-product"
import {
  AllocatedVoucher,
  AllocateVouchersInput,
  AllocateVouchersResult,
  AllocationShortfall,
  emptyPoolCounts,
  PoolCounts,
  PoolStatus,
  CustomerVoucher,
  PoolVoucher,
  VoucherCodeInput,
  VoucherEmailRenderer,
  VoucherModuleOptions,
} from "./types"
import { VoucherImportError } from "./utils/import-error"
import { parseCalendarDate, parseVoucherCsv } from "./utils/parse-voucher-csv"
import { dayOf, DEFAULT_TIMEZONE, lastDayOf, startOfDay } from "./utils/timezone"
import {
  codeHint,
  createVoucherCrypto,
  normalizeCode,
  VoucherCrypto,
} from "./utils/crypto"

// Hashes are looked up in chunks so a very large import never exceeds the database's
// limit on query parameters.
const LOOKUP_CHUNK_SIZE = 1000

// The knex transaction of the current context, required by statements whose checks must hold
// under concurrency: outside a transaction they would not hold at all.
function transactionKnex(sharedContext: Context, caller: string) {
  const manager = sharedContext.transactionManager as SqlEntityManager | undefined
  const knex = manager?.getTransactionContext()

  if (!knex) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `${caller} must run inside a transaction.`)
  }

  return knex
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }

  return chunks
}

// Medusa turns a database unique violation into a MedusaError of type invalid_data whose
// message ends with "already exists." and names the column and its value (here, the code
// hash). The raw driver errors are also recognised in case that mapping changes.
function isUniqueViolation(error: unknown): boolean {
  const { name, code, type, message } = (error ?? {}) as {
    name?: string
    code?: string
    type?: string
    message?: string
  }

  return (
    name === "UniqueConstraintViolationException" ||
    code === "23505" ||
    (type === MedusaError.Types.INVALID_DATA &&
      /already exists\.?$/i.test(message ?? ""))
  )
}

export type CreateVouchersFromCodesInput = {
  batch_id: string
  vouchers: VoucherCodeInput[]
}

class VoucherModuleService extends MedusaService({
  Voucher,
  VoucherBatch,
  VoucherProduct,
  VoucherAllocation,
  VoucherAllocationFailure,
  VoucherDelivery,
}) {
  protected crypto_: VoucherCrypto
  protected timezone_: string
  protected minimumRemainingValidityDays_: number
  protected emailRenderer_: VoucherEmailRenderer | null
  protected automaticDelivery_: boolean
  protected fulfill_: boolean
  protected fulfillmentOptions_: NonNullable<VoucherModuleOptions["delivery"]>["fulfillment"]

  constructor(container: Record<string, unknown>, options: VoucherModuleOptions) {
    // @ts-ignore
    super(...arguments)

    this.crypto_ = createVoucherCrypto(options?.encryptionKey)
    this.timezone_ = options?.timezone ?? DEFAULT_TIMEZONE
    this.minimumRemainingValidityDays_ = options?.minimumRemainingValidityDays ?? 0
    this.emailRenderer_ = options?.delivery?.renderers?.email ?? null
    this.automaticDelivery_ = options?.delivery?.automatic ?? true
    this.fulfill_ = options?.delivery?.fulfill ?? true
    // Kept as given, so a getter for the shipping option id is read on every fulfillment.
    this.fulfillmentOptions_ = options?.delivery?.fulfillment
  }

  /**
   * The delivery options: whether allocation starts delivery on its own, what a Delivery is
   * rendered with (`email` is null when the store has no renderer), and whether and with
   * which shipping option (null when not configured) the Voucher lines are fulfilled after it.
   */
  async getDeliverySettings() {
    return {
      automatic: this.automaticDelivery_,
      fulfill: this.fulfill_,
      shippingOptionId: this.fulfillmentOptions_?.shippingOptionId ?? null,
      timezone: this.timezone_,
      renderers: { email: this.emailRenderer_ },
    }
  }

  /** The IANA time zone (the `timezone` option) in which the plugin counts calendar days. */
  async getTimezone() {
    return this.timezone_
  }

  /**
   * The instant at which a calendar day given as `YYYY-MM-DD` starts in the configured time
   * zone. A day that is not on the calendar (2026-02-30) is refused rather than rolled over.
   */
  async startOfCalendarDay(day: string) {
    const parts = parseCalendarDate(day)

    if (!parts) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `${JSON.stringify(day)} is not a day on the calendar as YYYY-MM-DD`
      )
    }

    return startOfDay(parts[0], parts[1], parts[2], this.timezone_)
  }

  /** Reads a vouchers CSV, turning its dates into whole days in the configured time zone. */
  async parseVoucherCsv(content: string) {
    return parseVoucherCsv(content, this.timezone_)
  }

  /**
   * Encrypts and stores plain voucher codes (and PINs) for a batch. Each voucher takes
   * its variant from the batch, so the two can never disagree. The whole call is
   * rejected, creating nothing, when the batch does not exist, a validity period ends
   * before it starts, or a code is empty, repeated in the input or already stored. Errors
   * name the 1-based position in `vouchers` (or its `source_line`), never the code itself.
   */
  async createVouchersFromCodes({
    batch_id,
    vouchers,
  }: CreateVouchersFromCodesInput) {
    const batch = await this.retrieveVoucherBatch(batch_id)

    const fromFile = vouchers.some((voucher) => voucher.source_line !== undefined)
    const place = (index: number) => vouchers[index].source_line ?? index + 1
    const where = (index: number) =>
      fromFile ? `on line ${place(index)}` : String(place(index))
    const places = fromFile ? "lines" : "positions"
    // A file's problems are listed by line for the import route; positions are not lines.
    const refused = (message: string, lines: number[], code: VoucherImportProblemCode) =>
      fromFile
        ? new VoucherImportError(message, lines.map((line) => ({ line, code })))
        : new MedusaError(MedusaError.Types.INVALID_DATA, message)

    const rows = vouchers.map((voucher, index) => {
      const code = normalizeCode(voucher.code ?? "")

      if (!code) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Voucher ${where(index)} has an empty code`
        )
      }

      const valid_from = voucher.valid_from ?? null
      const valid_until = voucher.valid_until ?? null

      if (valid_from && valid_until && valid_until <= valid_from) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Voucher ${where(index)} ends (valid_until) at or before it starts (valid_from)`
        )
      }

      const pin = voucher.pin?.trim()

      return {
        code_encrypted: this.crypto_.encrypt(code),
        code_hash: this.crypto_.hash(code),
        code_hint: codeHint(code),
        pin_encrypted: pin ? this.crypto_.encrypt(pin) : null,
        valid_from,
        valid_until,
        variant_id: batch.variant_id,
        batch_id: batch.id,
      }
    })

    const positionByHash = new Map<string, number>()
    const repeated: number[] = []

    rows.forEach((row, index) => {
      if (positionByHash.has(row.code_hash)) {
        repeated.push(place(index))
      } else {
        positionByHash.set(row.code_hash, index)
      }
    })

    if (repeated.length) {
      throw refused(
        `Repeated codes at ${places}: ${repeated.join(", ")}`,
        repeated,
        VoucherImportProblemCode.CODE_REPEATED_IN_FILE
      )
    }

    const stored: { code_hash: string }[] = []

    for (const hashes of chunk([...positionByHash.keys()], LOOKUP_CHUNK_SIZE)) {
      stored.push(
        ...(await this.listVouchers(
          { code_hash: hashes },
          { select: ["id", "code_hash"], take: null }
        ))
      )
    }

    if (stored.length) {
      const positions = stored
        .map((voucher) => place(positionByHash.get(voucher.code_hash) as number))
        .sort((a, b) => a - b)

      throw refused(
        `Codes already stored at ${places}: ${positions.join(", ")}`,
        positions,
        VoucherImportProblemCode.CODE_ALREADY_STORED
      )
    }

    try {
      return await this.createVouchers(rows)
    } catch (error) {
      // Another import stored one of these codes between the check above and this insert.
      if (isUniqueViolation(error)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Some codes were stored by another import at the same time. Nothing was imported; try again."
        )
      }

      throw error
    }
  }

  /**
   * Allocates one Available Voucher to each purchased unit of the given lines, all or none:
   * when any line cannot be covered nothing is allocated and an Allocation failure is
   * recorded for each short line. Running it again for an order that is already allocated
   * returns its Allocations unchanged. Never decrypts a code.
   */
  @InjectManager()
  async allocateVouchers(
    input: AllocateVouchersInput,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<AllocateVouchersResult> {
    try {
      return await this.allocateVouchers_(input, sharedContext)
    } catch (error) {
      // A concurrent run for the same order committed first and a unique index (the unit of
      // a line item, or the open failure of a line) rejected this one, whose transaction
      // rolled back: return what the winner made.
      if (isUniqueViolation(error)) {
        const existing = await this.listOrderAllocations_(input.order_id, sharedContext)

        if (existing.length) {
          return { allocated: existing, failures: [], created: false }
        }

        const open = await this.listVoucherAllocationFailures(
          { order_id: input.order_id, status: AllocationFailureStatus.OPEN },
          {},
          sharedContext
        )

        if (open.length) {
          return {
            allocated: [],
            failures: open.map((failure) => ({
              order_line_item_id: failure.order_line_item_id,
              variant_id: failure.variant_id,
              requested: failure.quantity_requested,
              available: failure.quantity_available,
            })),
            created: false,
          }
        }
      }

      throw error
    }
  }

  @InjectTransactionManager()
  protected async allocateVouchers_(
    input: AllocateVouchersInput,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<AllocateVouchersResult> {
    // Allocation is all or none per order, so an order that already has its Allocations is
    // complete: a repeated run returns them unchanged.
    const existing = await this.listOrderAllocations_(input.order_id, sharedContext)

    if (existing.length) {
      return { allocated: existing, failures: [], created: false }
    }

    const taken = new Set<string>()
    const picks: { line: AllocateVouchersInput["lines"][number]; voucherIds: string[] }[] = []
    const failures: AllocationShortfall[] = []

    for (const line of input.lines) {
      const found = await this.findEligibleVoucherIds_(
        line.variant_id,
        line.quantity,
        taken,
        sharedContext
      )

      if (found.length < line.quantity) {
        failures.push({
          order_line_item_id: line.order_line_item_id,
          variant_id: line.variant_id,
          requested: line.quantity,
          available: found.length,
        })
      } else {
        found.forEach((id) => taken.add(id))
        picks.push({ line, voucherIds: found })
      }
    }

    if (failures.length) {
      // A line already waiting on an open failure keeps that one, so a repeated run while
      // the Pool is still short adds nothing.
      const open = await this.listVoucherAllocationFailures(
        {
          order_line_item_id: failures.map((failure) => failure.order_line_item_id),
          status: AllocationFailureStatus.OPEN,
        },
        { select: ["order_line_item_id"] },
        sharedContext
      )
      const waiting = new Set(open.map((failure) => failure.order_line_item_id))

      await this.createVoucherAllocationFailures(
        failures.filter((failure) => !waiting.has(failure.order_line_item_id)).map((failure) => ({
          order_id: input.order_id,
          order_line_item_id: failure.order_line_item_id,
          variant_id: failure.variant_id,
          quantity_requested: failure.requested,
          quantity_available: failure.available,
        })),
        sharedContext
      )

      return { allocated: [], failures, created: false }
    }

    const rows = picks.flatMap(({ line, voucherIds }) =>
      voucherIds.map((voucher_id, index) => ({
        order_id: input.order_id,
        order_line_item_id: line.order_line_item_id,
        unit_index: index + 1,
        customer_id: input.customer_id ?? null,
        recipient_email: input.recipient_email ?? null,
        voucher_id,
      }))
    )

    await this.updateVouchers(
      { selector: { id: rows.map((row) => row.voucher_id) }, data: { status: VoucherStatus.ALLOCATED } },
      sharedContext
    )
    const created = await this.createVoucherAllocations(rows, sharedContext)

    // The order is served now, so whatever it was waiting on is settled, however it got here.
    await this.resolveOpenFailures_(
      { order_id: input.order_id },
      { resolved_by: ALLOCATION_FAILURE_RESOLVED_BY_SYSTEM, note: "Allocated" },
      sharedContext
    )

    const allocated: AllocatedVoucher[] = created.map((allocation, index) => ({
      allocation_id: allocation.id,
      voucher_id: rows[index].voucher_id,
      order_line_item_id: allocation.order_line_item_id,
      unit_index: allocation.unit_index,
    }))

    return { allocated, failures: [], created: true }
  }

  // The Allocations that serve an order's units for the first time (Replacements excluded).
  @InjectTransactionManager()
  protected async listOrderAllocations_(
    orderId: string,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<AllocatedVoucher[]> {
    const allocations = await this.listVoucherAllocations(
      { order_id: orderId, replaces_allocation_id: null },
      { select: ["id", "voucher_id", "order_line_item_id", "unit_index"] },
      sharedContext
    )

    return allocations.map((allocation) => ({
      allocation_id: allocation.id,
      voucher_id: allocation.voucher_id,
      order_line_item_id: allocation.order_line_item_id,
      unit_index: allocation.unit_index,
    }))
  }

  // Locks and returns up to `quantity` Vouchers of a variant that can be allocated now, best
  // first: Available, not expired and with at least the minimum remaining validity counted
  // from the later of now and its start; the earliest valid-until first, never-expiring last.
  // Rows other transactions hold are skipped, so concurrent orders get different Vouchers
  // without waiting on each other. The locks last until the transaction ends.
  @InjectTransactionManager()
  protected async findEligibleVoucherIds_(
    variantId: string,
    quantity: number,
    taken: Set<string>,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<string[]> {
    // A FOR UPDATE on a pooled (autocommit) connection would release the lock at once and
    // let two orders take the same Voucher, so fail instead of falling back, as Medusa's
    // payment module does when it locks a payment for capture.
    const manager = sharedContext.transactionManager as SqlEntityManager | undefined
    const knex = manager?.getTransactionContext()

    if (!knex) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "findEligibleVoucherIds_ must run inside a transaction to lock the Vouchers it picks."
      )
    }

    const now = new Date()

    await knex.raw("SET LOCAL lock_timeout = '3s'")
    const rows: { id: string }[] = await knex("voucher")
      .select("id")
      .where({ variant_id: variantId, status: VoucherStatus.AVAILABLE, deleted_at: null })
      .whereNotIn("id", [...taken])
      .whereRaw(...this.sellableClause_(now))
      .orderByRaw("valid_until asc nulls last, created_at asc")
      .limit(quantity)
      .forUpdate()
      .skipLocked()

    return rows.map((row) => row.id)
  }

  // Whether an `available` Voucher can still be sold at `now` (Available in GLOSSARY.md): its
  // Validity period has not ended and it has at least the Minimum remaining validity counted
  // from the later of now and its start. Allocation, the Pool counts and lists share it.
  // `table` qualifies the columns when the Voucher table is joined.
  protected sellableClause_(now: Date, table = ""): [string, (Date | number)[]] {
    const column = (name: string) => (table ? `${table}.${name}` : name)

    return [
      `(${column("valid_until")} is null or (${column("valid_until")} > ? and ${column("valid_until")} - greatest(?::timestamptz, coalesce(${column("valid_from")}, ?::timestamptz)) >= make_interval(days => ?)))`,
      [now, now, now, this.minimumRemainingValidityDays_],
    ]
  }

  // A Voucher's place in its Pool at `now` (a `PoolStatus`): its status, except that an
  // `available` Voucher that can no longer be sold is `expired` once its Validity period has
  // ended and `under_minimum` before that.
  protected poolStatusSql_(now: Date, table = ""): [string, (Date | number | string)[]] {
    const column = (name: string) => (table ? `${table}.${name}` : name)
    const [sellable, sellableBindings] = this.sellableClause_(now, table)

    return [
      `(case when ${column("status")} = ? and ${sellable} then ? ` +
        `when ${column("status")} = ? and ${column("valid_until")} <= ? then ? ` +
        `when ${column("status")} = ? then ? else ${column("status")}::text end)`,
      [
        VoucherStatus.AVAILABLE,
        ...sellableBindings,
        "available",
        VoucherStatus.AVAILABLE,
        now,
        "expired",
        VoucherStatus.AVAILABLE,
        "under_minimum",
      ],
    ]
  }

  /**
   * Counts the Pool of each Voucher product variant (`by: "variant"`) or Voucher batch
   * (`by: "batch"`) in `ids` at `now`: Available (can still be sold), Expired (past its
   * Validity period), under the Minimum remaining validity, Allocated, Delivered and Void.
   * Computed when read; no status changes. An id without Vouchers counts zeros.
   */
  @InjectManager()
  async countPool(
    by: "variant" | "batch",
    ids: string[],
    now: Date = new Date(),
    @MedusaContext() sharedContext: Context = {}
  ): Promise<Map<string, PoolCounts>> {
    const counts = new Map<string, PoolCounts>(ids.map((id) => [id, emptyPoolCounts()]))

    if (!ids.length) {
      return counts
    }

    const key = by === "variant" ? "variant_id" : "batch_id"
    const knex = (sharedContext.manager as SqlEntityManager).getKnex()
    const [poolStatus, bindings] = this.poolStatusSql_(now)
    const rows: { key: string; pool_status: PoolStatus; total: number }[] = await knex("voucher")
      .select(`${key} as key`, knex.raw(`${poolStatus} as pool_status`, bindings), knex.raw("count(*)::int as total"))
      .whereIn(key, ids)
      .whereNull("deleted_at")
      .groupByRaw(`${key}, pool_status`)

    for (const row of rows) {
      counts.get(row.key)![row.pool_status] = row.total
    }

    return counts
  }

  /**
   * One page of a customer's own Vouchers, newest Allocation first, optionally of one order,
   * with the total that match: those Allocated or Delivered to an order of `customer_id`
   * (recorded on the Allocation), never Void. Never a code.
   */
  @InjectManager()
  async listCustomerVouchers(
    input: { customer_id: string; order_id?: string; skip: number; take: number },
    @MedusaContext() sharedContext: Context = {}
  ): Promise<[CustomerVoucher[], number]> {
    const knex = (sharedContext.manager as SqlEntityManager).getKnex()
    const matching = this.customerVouchersQuery_(knex, input.customer_id).modify((query) => {
      if (input.order_id) {
        query.where("a.order_id", input.order_id)
      }
    })

    const [{ total }] = await matching.clone().count({ total: "*" })
    const rows = await this.selectCustomerVouchers_(matching)
      .orderByRaw("a.created_at desc, a.order_line_item_id asc, a.unit_index asc")
      .offset(input.skip)
      .limit(input.take)

    return [rows.map((row) => this.toCustomerVoucher_(row)), Number(total)]
  }

  /** One of a customer's own Vouchers as `listCustomerVouchers` shows it; NOT_FOUND otherwise. */
  @InjectManager()
  async retrieveCustomerVoucher(
    customerId: string,
    id: string,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<CustomerVoucher> {
    const knex = (sharedContext.manager as SqlEntityManager).getKnex()
    const [row] = await this.selectCustomerVouchers_(
      this.customerVouchersQuery_(knex, customerId).where("v.id", id)
    )

    if (!row) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Voucher ${id} was not found`)
    }

    return this.toCustomerVoucher_(row)
  }

  private customerVouchersQuery_(knex: ReturnType<SqlEntityManager["getKnex"]>, customerId: string) {
    return knex("voucher as v")
      .join("voucher_allocation as a", (join) =>
        join.on("a.voucher_id", "v.id").andOnNull("a.deleted_at")
      )
      .where({ "a.customer_id": customerId, "v.deleted_at": null })
      .whereIn("v.status", [VoucherStatus.ALLOCATED, VoucherStatus.DELIVERED])
  }

  private selectCustomerVouchers_(query: ReturnType<VoucherModuleService["customerVouchersQuery_"]>) {
    return query
      .clone()
      .leftJoin("voucher_batch as b", "b.id", "v.batch_id")
      .leftJoin("voucher_product as p", "p.id", "b.voucher_product_id")
      .select(
        "v.id",
        "v.status",
        "v.code_hint",
        "v.variant_id",
        "v.valid_from",
        "v.valid_until",
        "a.order_id",
        "p.face_value",
        "p.currency_code",
        "b.redemption_instructions"
      )
  }

  private toCustomerVoucher_(row: Record<string, any>): CustomerVoucher {
    return {
      id: row.id,
      status: row.status,
      code_hint: row.code_hint,
      order_id: row.order_id,
      variant_id: row.variant_id,
      face_value: Number(row.face_value),
      currency_code: row.currency_code,
      first_day: row.valid_from ? dayOf(new Date(row.valid_from), this.timezone_) : null,
      last_day: row.valid_until ? lastDayOf(new Date(row.valid_until), this.timezone_) : null,
      redemption_instructions: row.redemption_instructions ?? null,
    }
  }

  /**
   * One page of a Voucher product variant's Vouchers, soonest to expire first and open-ended
   * last, optionally only those with `status` (a `PoolStatus`) or in `batch_id`, with the
   * total that match. Each has its status in the Pool, code hint, batch, first and last usable
   * day in the store's time zone, and the order of its first-time Allocation. Never a code.
   */
  @InjectManager()
  async listPoolVouchers(
    input: { variant_id: string; status?: PoolStatus; batch_id?: string; skip: number; take: number },
    now: Date = new Date(),
    @MedusaContext() sharedContext: Context = {}
  ): Promise<[PoolVoucher[], number]> {
    const knex = (sharedContext.manager as SqlEntityManager).getKnex()
    const [poolStatus, bindings] = this.poolStatusSql_(now, "v")
    const matching = knex("voucher as v")
      .where({ "v.variant_id": input.variant_id, "v.deleted_at": null })
      .modify((query) => {
        if (input.status) {
          query.whereRaw(`${poolStatus} = ?`, [...bindings, input.status])
        }
        if (input.batch_id) {
          query.where("v.batch_id", input.batch_id)
        }
      })

    const [{ total }] = await matching.clone().count({ total: "*" })
    const rows = await matching
      .clone()
      .leftJoin("voucher_batch as b", "b.id", "v.batch_id")
      .leftJoin("voucher_allocation as a", (join) =>
        join.on("a.voucher_id", "v.id").andOnNull("a.deleted_at").andOnNull("a.replaces_allocation_id")
      )
      .select(
        "v.id",
        "v.code_hint",
        "v.valid_from",
        "v.valid_until",
        "b.id as batch_id",
        "b.reference as batch_reference",
        "a.order_id",
        knex.raw(`${poolStatus} as pool_status`, bindings)
      )
      .orderByRaw("v.valid_until asc nulls last, v.created_at asc, v.id asc")
      .offset(input.skip)
      .limit(input.take)

    const vouchers = rows.map((row) => ({
      id: row.id,
      status: row.pool_status,
      code_hint: row.code_hint,
      batch: { id: row.batch_id, reference: row.batch_reference },
      first_day: row.valid_from ? dayOf(new Date(row.valid_from), this.timezone_) : null,
      last_day: row.valid_until ? lastDayOf(new Date(row.valid_until), this.timezone_) : null,
      order_id: row.order_id ?? null,
    }))

    return [vouchers, Number(total)]
  }

  /**
   * Closes one open Allocation failure settled by a person, with their note and identity.
   * Refused when it is unknown (404) or already resolved (422).
   */
  @InjectManager()
  async resolveAllocationFailure(
    input: { id: string; note: string; resolved_by: string },
    @MedusaContext() sharedContext: Context = {}
  ) {
    return await this.resolveAllocationFailure_(input, sharedContext)
  }

  @InjectTransactionManager()
  protected async resolveAllocationFailure_(
    input: { id: string; note: string; resolved_by: string },
    @MedusaContext() sharedContext: Context = {}
  ) {
    const resolved = await this.resolveOpenFailures_(
      { id: input.id },
      { resolved_by: input.resolved_by, note: input.note },
      sharedContext
    )

    if (resolved.length) {
      return await this.retrieveVoucherAllocationFailure(input.id, {}, sharedContext)
    }

    const [existing] = await this.listVoucherAllocationFailures(
      { id: input.id },
      { select: ["id"] },
      sharedContext
    )

    throw existing
      ? new MedusaError(
          MedusaError.Types.DUPLICATE_ERROR,
          `Allocation failure ${input.id} is already resolved`
        )
      : new MedusaError(MedusaError.Types.NOT_FOUND, `Allocation failure ${input.id} was not found`)
  }

  // Marks the open failures matching `where` resolved and returns their ids. The status check
  // and the change are one UPDATE, so of two concurrent callers only one changes a failure:
  // the generated `updateVoucherAllocationFailures` reads the rows first and would let both win.
  @InjectTransactionManager()
  protected async resolveOpenFailures_(
    where: { id?: string; order_id?: string },
    resolution: { resolved_by: string; note: string },
    @MedusaContext() sharedContext: Context = {}
  ): Promise<string[]> {
    const knex = transactionKnex(sharedContext, "resolveOpenFailures_")
    const now = new Date()
    const rows: { id: string }[] = await knex("voucher_allocation_failure")
      .where({ ...where, status: AllocationFailureStatus.OPEN, deleted_at: null })
      .update({
        status: AllocationFailureStatus.RESOLVED,
        resolved_at: now,
        resolved_by: resolution.resolved_by,
        resolution_note: resolution.note,
        updated_at: now,
      })
      .returning("id")

    return rows.map((row) => row.id)
  }

  /**
   * Claims an order's Delivery on a channel for sending, creating it when there is none: it
   * moves a pending or failed Delivery to sending, counts the attempt and records the
   * recipient. Returns the claimed Delivery, or null when another caller holds it or it was
   * delivered. Only the caller that gets a Delivery back may send.
   */
  @InjectManager()
  async claimDelivery(
    input: { order_id: string; channel: DeliveryChannel; recipient: string | null },
    @MedusaContext() sharedContext: Context = {}
  ) {
    return await this.claimDelivery_(input, sharedContext)
  }

  // The insert ignores an existing row and the claim is one conditional UPDATE, so of two
  // concurrent callers only one moves the row to sending. The generated update methods read
  // the rows first and would let both win (see resolveOpenFailures_).
  @InjectTransactionManager()
  protected async claimDelivery_(
    input: { order_id: string; channel: DeliveryChannel; recipient: string | null },
    @MedusaContext() sharedContext: Context = {}
  ) {
    const knex = transactionKnex(sharedContext, "claimDelivery_")
    const now = new Date()

    await knex.raw(
      `insert into "voucher_delivery" ("id", "order_id", "channel", "recipient", "status", "attempts", "created_at", "updated_at")
       values (?, ?, ?, ?, ?, 0, ?, ?)
       on conflict ("order_id", "channel") where "deleted_at" is null do nothing`,
      [generateEntityId(undefined, "vdel"), input.order_id, input.channel, input.recipient, DeliveryStatus.PENDING, now, now]
    )

    const rows: { id: string }[] = await knex("voucher_delivery")
      .where({ order_id: input.order_id, channel: input.channel, deleted_at: null })
      .whereIn("status", [DeliveryStatus.PENDING, DeliveryStatus.FAILED])
      .update({
        status: DeliveryStatus.SENDING,
        attempts: knex.raw("attempts + 1"),
        recipient: input.recipient,
        updated_at: now,
      })
      .returning("id")

    if (!rows.length) {
      return null
    }

    return await this.retrieveVoucherDelivery(rows[0].id, {}, sharedContext)
  }

  /**
   * Marks the Available Vouchers whose Validity period has ended by `now` as Expired. Allocated,
   * Delivered and Void Vouchers keep their status. Returns how many were marked.
   */
  @InjectManager()
  async markExpiredVouchers(
    input: { now: Date },
    @MedusaContext() sharedContext: Context = {}
  ): Promise<number> {
    return await this.markExpiredVouchers_(input, sharedContext)
  }

  // One conditional UPDATE, so a Voucher allocated meanwhile keeps its status. Allocation only
  // takes Vouchers still valid after now, so the two never want the same row.
  @InjectTransactionManager()
  protected async markExpiredVouchers_(
    input: { now: Date },
    @MedusaContext() sharedContext: Context = {}
  ): Promise<number> {
    const knex = transactionKnex(sharedContext, "markExpiredVouchers_")

    const rows: { id: string }[] = await knex("voucher")
      .where({ status: VoucherStatus.AVAILABLE, deleted_at: null })
      .where("valid_until", "<=", input.now)
      .update({ status: VoucherStatus.EXPIRED, updated_at: new Date() })
      .returning("id")

    return rows.length
  }

  /**
   * Marks the Deliveries that have been sending since before `before` as failed, as a process
   * that died mid-send left them, so they are tried again like any failed Delivery. Returns
   * their ids.
   */
  @InjectManager()
  async releaseStaleDeliveries(
    input: { before: Date },
    @MedusaContext() sharedContext: Context = {}
  ): Promise<string[]> {
    return await this.releaseStaleDeliveries_(input, sharedContext)
  }

  // One conditional UPDATE, so a Delivery that completes meanwhile is not marked failed.
  @InjectTransactionManager()
  protected async releaseStaleDeliveries_(
    input: { before: Date },
    @MedusaContext() sharedContext: Context = {}
  ): Promise<string[]> {
    const knex = transactionKnex(sharedContext, "releaseStaleDeliveries_")

    const rows: { id: string }[] = await knex("voucher_delivery")
      .where({ status: DeliveryStatus.SENDING, deleted_at: null })
      .where("updated_at", "<", input.before)
      .update({
        status: DeliveryStatus.FAILED,
        last_error: "Sending was interrupted",
        updated_at: new Date(),
      })
      .returning("id")

    return rows.map((row) => row.id)
  }

  /**
   * Records that the email provider accepted a claimed Delivery: it becomes delivered and the
   * Vouchers it sent become Delivered, together.
   */
  @InjectManager()
  async completeDelivery(
    input: { id: string; voucher_ids: string[] },
    @MedusaContext() sharedContext: Context = {}
  ) {
    await this.completeDelivery_(input, sharedContext)
  }

  @InjectTransactionManager()
  protected async completeDelivery_(
    input: { id: string; voucher_ids: string[] },
    @MedusaContext() sharedContext: Context = {}
  ) {
    await this.updateVoucherDeliveries(
      { id: input.id, status: DeliveryStatus.DELIVERED, delivered_at: new Date(), last_error: null },
      sharedContext
    )
    await this.updateVouchers(
      input.voucher_ids.map((id) => ({ id, status: VoucherStatus.DELIVERED })),
      sharedContext
    )
  }

  /**
   * Records that a claimed Delivery was not sent; its Vouchers stay Allocated with the order.
   * `error` is stored as given, so it must not contain a code, PIN or hash.
   */
  async failDelivery(input: { id: string; error: string }) {
    await this.updateVoucherDeliveries({
      id: input.id,
      status: DeliveryStatus.FAILED,
      last_error: input.error,
    })
  }

  /** Decrypts the code and PIN of a voucher. Callers decide who may see them. */
  async revealVoucher(id: string) {
    const voucher = await this.retrieveVoucher(id)

    return {
      code: this.crypto_.decrypt(voucher.code_encrypted),
      pin: voucher.pin_encrypted
        ? this.crypto_.decrypt(voucher.pin_encrypted)
        : null,
    }
  }
}

export default VoucherModuleService
