import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

export const assertVariantNotAVoucherProductStep = createStep(
  "assert-variant-not-a-voucher-product",
  async (input: { variant_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const { data } = await query.graph({
      entity: "voucher_product",
      fields: ["id"],
      filters: { product_variant: { id: input.variant_id } },
    })

    // DUPLICATE_ERROR keeps the message (Medusa replaces a CONFLICT's with a generic one).
    if (data.length) {
      throw new MedusaError(
        MedusaError.Types.DUPLICATE_ERROR,
        `Product variant ${input.variant_id} is already a Voucher product`
      )
    }

    return new StepResponse(input.variant_id)
  }
)
