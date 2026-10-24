import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

// The variant of the Voucher product `id`, refused with 404 when there is no such product.
export async function voucherProductVariantId(container: MedusaContainer, id: string): Promise<string> {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "voucher_product",
    fields: ["id", "product_variant.id"],
    filters: { id },
  })

  if (!data[0]) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Voucher product ${id} was not found`)
  }

  return data[0].product_variant?.id ?? ""
}
