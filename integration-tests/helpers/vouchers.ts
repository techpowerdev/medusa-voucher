import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import VoucherModuleService from "../../src/modules/voucher/service"
import { VoucherCodeInput } from "../../src/modules/voucher/types"
import { createVariant } from "./admin"
import { createVoucherProductWorkflow } from "../../src/workflows/create-voucher-product"

// A variant marked as a Voucher product, through the plugin's own workflow.
export async function createVoucherProductVariant(
  container: MedusaContainer,
  title = "100"
) {
  const variantId = await createVariant(container, title)
  const { result } = await createVoucherProductWorkflow(container).run({
    input: { variant_id: variantId, face_value: Number(title), currency_code: "thb" },
  })

  return { variantId, voucherProductId: result.id }
}

// Stocks the Pool of a Voucher product with Vouchers that have the given validity.
export async function stockVouchers(
  container: MedusaContainer,
  product: { variantId: string; voucherProductId: string },
  vouchers: VoucherCodeInput[]
) {
  const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)
  const batch = await service.createVoucherBatches({
    voucher_product_id: product.voucherProductId,
    variant_id: product.variantId,
    purchased_at: new Date(),
  })

  return service.createVouchersFromCodes({ batch_id: batch.id, vouchers })
}

export type OrderLine = { variant_id: string; quantity: number }

// An order with one line item per entry, through the Order module.
export async function createOrder(container: MedusaContainer, lines: OrderLine[]) {
  const order = await container.resolve(Modules.ORDER).createOrders({
    currency_code: "thb",
    email: "customer@example.test",
    items: lines.map((line, index) => ({
      title: `Line ${index + 1}`,
      variant_id: line.variant_id,
      quantity: line.quantity,
      unit_price: 100,
    })),
  })

  return order
}
