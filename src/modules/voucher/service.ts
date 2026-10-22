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
  VoucherStatus,
} from "./constants"
import AllocationFailure from "./models/allocation-failure"
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
  VoucherCodeInput,
  VoucherModuleOptions,
} from "./types"
import { parseVoucherCsv } from "./utils/parse-voucher-csv"
import { DEFAULT_TIMEZONE } from "./utils/timezone"
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
  AllocationFailure,
  VoucherDelivery,
}) {
  protected crypto_: VoucherCrypto
  protected timezone_: string
  protected minimumRemainingValidityDays_: number

  constructor(container: Record<string, unknown>, options: VoucherModuleOptions) {
    // @ts-ignore
    super(...arguments)

    this.crypto_ = createVoucherCrypto(options?.encryptionKey)
    this.timezone_ = options?.timezone ?? DEFAULT_TIMEZONE
    this.minimumRemainingValidityDays_ = options?.minimumRemainingValidityDays ?? 0
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
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Repeated codes at ${places}: ${repeated.join(", ")}`
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

      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Codes already stored at ${places}: ${positions.join(", ")}`
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
          return { allocated: existing, failures: [] }
        }

        const open = await this.listAllocationFailures(
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
      return { allocated: existing, failures: [] }
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
      const open = await this.listAllocationFailures(
        {
          order_line_item_id: failures.map((failure) => failure.order_line_item_id),
          status: AllocationFailureStatus.OPEN,
        },
        { select: ["order_line_item_id"] },
        sharedContext
      )
      const waiting = new Set(open.map((failure) => failure.order_line_item_id))

      await this.createAllocationFailures(
        failures.filter((failure) => !waiting.has(failure.order_line_item_id)).map((failure) => ({
          order_id: input.order_id,
          order_line_item_id: failure.order_line_item_id,
          variant_id: failure.variant_id,
          quantity_requested: failure.requested,
          quantity_available: failure.available,
        })),
        sharedContext
      )

      return { allocated: [], failures }
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

    return { allocated, failures: [] }
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
      .where((eligible) =>
        eligible.whereNull("valid_until").orWhere((ends) =>
          ends
            .where("valid_until", ">", now)
            .whereRaw("valid_until - greatest(?::timestamptz, coalesce(valid_from, ?::timestamptz)) >= make_interval(days => ?)", [
              now,
              now,
              this.minimumRemainingValidityDays_,
            ])
        )
      )
      .orderByRaw("valid_until asc nulls last, created_at asc")
      .limit(quantity)
      .forUpdate()
      .skipLocked()

    return rows.map((row) => row.id)
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
      return await this.retrieveAllocationFailure(input.id, {}, sharedContext)
    }

    const [existing] = await this.listAllocationFailures(
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
  // the generated `updateAllocationFailures` reads the rows first and would let both win.
  @InjectTransactionManager()
  protected async resolveOpenFailures_(
    where: { id?: string; order_id?: string },
    resolution: { resolved_by: string; note: string },
    @MedusaContext() sharedContext: Context = {}
  ): Promise<string[]> {
    const knex = transactionKnex(sharedContext, "resolveOpenFailures_")
    const now = new Date()
    const rows: { id: string }[] = await knex("allocation_failure")
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
