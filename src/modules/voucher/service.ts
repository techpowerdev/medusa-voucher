import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import AllocationFailure from "./models/allocation-failure"
import Voucher from "./models/voucher"
import VoucherAllocation from "./models/voucher-allocation"
import VoucherBatch from "./models/voucher-batch"
import { VoucherModuleOptions } from "./types"
import {
  codeHint,
  createVoucherCrypto,
  normalizeCode,
  VoucherCrypto,
} from "./utils/crypto"

// Hashes are looked up in chunks so a very large import never exceeds the database's
// limit on query parameters.
const LOOKUP_CHUNK_SIZE = 1000

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

export type VoucherCodeInput = {
  code: string
  pin?: string | null
  valid_from?: Date | null
  valid_until?: Date | null
}

export type CreateVouchersFromCodesInput = {
  batch_id: string
  vouchers: VoucherCodeInput[]
}

class VoucherModuleService extends MedusaService({
  Voucher,
  VoucherBatch,
  VoucherAllocation,
  AllocationFailure,
}) {
  protected crypto_: VoucherCrypto

  constructor(container: Record<string, unknown>, options: VoucherModuleOptions) {
    // @ts-ignore
    super(...arguments)

    this.crypto_ = createVoucherCrypto(options?.encryptionKey)
  }

  /**
   * Encrypts and stores plain voucher codes (and PINs) for a batch. Each voucher takes
   * its variant from the batch, so the two can never disagree. The whole call is
   * rejected, creating nothing, when the batch does not exist, a validity period ends
   * before it starts, or a code is empty, repeated in the input or already stored. Errors name the 1-based position in
   * `vouchers`, never the code itself.
   */
  async createVouchersFromCodes({
    batch_id,
    vouchers,
  }: CreateVouchersFromCodesInput) {
    const batch = await this.retrieveVoucherBatch(batch_id)

    const rows = vouchers.map((voucher, index) => {
      const code = normalizeCode(voucher.code ?? "")

      if (!code) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Voucher ${index + 1} has an empty code`
        )
      }

      const { valid_from, valid_until } = voucher

      if (valid_from && valid_until && valid_until < valid_from) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Voucher ${index + 1} ends (valid_until) before it starts (valid_from)`
        )
      }

      const pin = voucher.pin?.trim()

      return {
        code_encrypted: this.crypto_.encrypt(code),
        code_hash: this.crypto_.hash(code),
        code_hint: codeHint(code),
        pin_encrypted: pin ? this.crypto_.encrypt(pin) : null,
        valid_from: voucher.valid_from ?? null,
        valid_until: voucher.valid_until ?? null,
        variant_id: batch.variant_id,
        batch_id: batch.id,
      }
    })

    const positionByHash = new Map<string, number>()
    const repeated: number[] = []

    rows.forEach((row, index) => {
      if (positionByHash.has(row.code_hash)) {
        repeated.push(index + 1)
      } else {
        positionByHash.set(row.code_hash, index + 1)
      }
    })

    if (repeated.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Repeated codes at positions: ${repeated.join(", ")}`
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
        .map((voucher) => positionByHash.get(voucher.code_hash))
        .sort((a, b) => Number(a) - Number(b))

      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Codes already stored at positions: ${positions.join(", ")}`
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
