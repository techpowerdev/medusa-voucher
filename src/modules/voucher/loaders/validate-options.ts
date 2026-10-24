import { LoaderOptions } from "@medusajs/framework/types"
import { assertValidEncryptionKey } from "../utils/crypto"
import {
  assertValidAutomaticDelivery,
  assertValidFulfill,
  assertValidShippingOptionId,
} from "../utils/delivery-options"
import { VoucherModuleOptions } from "../types"
import { assertValidMinimumRemainingValidityDays } from "../utils/validity"
import { assertValidTimezone, DEFAULT_TIMEZONE } from "../utils/timezone"

// Stops the application from starting when the encryption key is missing or too short, the time zone is unknown
// or an option has the wrong type
// (see docs/adr/0002-encrypt-voucher-codes-with-a-required-key.md).
export default async function validateOptionsLoader({
  options,
}: LoaderOptions<VoucherModuleOptions>) {
  assertValidEncryptionKey(options?.encryptionKey)
  assertValidTimezone(options?.timezone ?? DEFAULT_TIMEZONE)
  assertValidMinimumRemainingValidityDays(options?.minimumRemainingValidityDays ?? 0)
  // Only a missing value means the default; `null` is a mistake in the configuration.
  assertValidAutomaticDelivery(options?.delivery?.automatic === undefined ? true : options.delivery.automatic)
  assertValidFulfill(options?.delivery?.fulfill === undefined ? true : options.delivery.fulfill)
  assertValidShippingOptionId(options?.delivery?.fulfillment?.shippingOptionId)
}
