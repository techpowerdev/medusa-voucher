import { LoaderOptions } from "@medusajs/framework/types"
import { assertValidEncryptionKey } from "../utils/crypto"
import { VoucherModuleOptions } from "../types"
import { assertValidMinimumRemainingValidityDays } from "../utils/validity"
import { assertValidTimezone, DEFAULT_TIMEZONE } from "../utils/timezone"

// Stops the application from starting when the encryption key is missing or too short or the time zone is unknown
// (see docs/adr/0002-encrypt-voucher-codes-with-a-required-key.md).
export default async function validateOptionsLoader({
  options,
}: LoaderOptions<VoucherModuleOptions>) {
  assertValidEncryptionKey(options?.encryptionKey)
  assertValidTimezone(options?.timezone ?? DEFAULT_TIMEZONE)
  assertValidMinimumRemainingValidityDays(options?.minimumRemainingValidityDays ?? 0)
}
