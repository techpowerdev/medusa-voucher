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
   * rejected, creating nothing, when the batch does not exist or a code is empty,
   * repeated in the input or already stored. Errors name the 1-based position in
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

    const existing = await this.listVouchers(
      { code_hash: [...positionByHash.keys()] },
      { select: ["id", "code_hash"] }
    )

    if (existing.length) {
      const positions = existing
        .map((voucher) => positionByHash.get(voucher.code_hash))
        .sort((a, b) => Number(a) - Number(b))

      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Codes already stored at positions: ${positions.join(", ")}`
      )
    }

    return await this.createVouchers(rows)
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
