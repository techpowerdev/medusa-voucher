import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { VOUCHER_MODULE } from "../../modules/voucher"
import VoucherModuleService from "../../modules/voucher/service"

// Returns the id of the variant a Voucher product is linked to. An unknown Voucher product
// is not found; one without a variant (its variant was deleted) cannot take Vouchers.
export const resolveVoucherProductVariantStep = createStep(
  "resolve-voucher-product-variant",
  async (input: { voucher_product_id: string }, { container }) => {
    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    await service.retrieveVoucherProduct(input.voucher_product_id)

    const { data } = await query.graph({
      entity: "voucher_product",
      fields: ["id", "product_variant.id"],
      filters: { id: input.voucher_product_id },
    })
    const variantId = data[0]?.product_variant?.id

    if (!variantId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Voucher product ${input.voucher_product_id} has no product variant, so Vouchers cannot be imported for it`
      )
    }

    return new StepResponse(variantId)
  }
)
