import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

export const validateVoucherVariantStep = createStep(
  "validate-voucher-variant",
  async (input: { variant_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const { data } = await query.graph({
      entity: "product_variant",
      fields: ["id"],
      filters: { id: input.variant_id },
    })

    if (!data.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Product variant ${input.variant_id} was not found`
      )
    }

    return new StepResponse(input.variant_id)
  }
)
