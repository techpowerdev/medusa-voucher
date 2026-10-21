import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { VOUCHER_MODULE } from "../../modules/voucher"
import VoucherModuleService from "../../modules/voucher/service"

// A Voucher product's Face value and currency describe the Vouchers it holds, so they can
// change only while it holds none. Throws not found for an unknown Voucher product.
export const assertVoucherProductHasNoVouchersStep = createStep(
  "assert-voucher-product-has-no-vouchers",
  async (input: { id: string }, { container }) => {
    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    await service.retrieveVoucherProduct(input.id)

    const { data } = await query.graph({
      entity: "voucher_product",
      fields: ["id", "product_variant.id"],
      filters: { id: input.id },
    })
    const variantId = data[0]?.product_variant?.id

    if (variantId) {
      const [, count] = await service.listAndCountVouchers(
        { variant_id: variantId },
        { select: ["id"], take: 1 }
      )

      if (count > 0) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Voucher product ${input.id} has Vouchers, so its Face value and currency can no longer change`
        )
      }
    }

    return new StepResponse(input.id)
  }
)
