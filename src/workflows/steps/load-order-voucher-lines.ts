import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { AllocateVouchersInput } from "../../modules/voucher/types"

// The units of an order that need a Voucher: only lines whose variant is a Voucher product.
export const loadOrderVoucherLinesStep = createStep(
  "load-order-voucher-lines",
  async (input: { order_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "customer_id", "email", "items.id", "items.variant_id", "items.detail.quantity"],
      filters: { id: input.order_id },
    })
    const order = orders[0]

    if (!order) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order ${input.order_id} was not found`)
    }

    const variantIds = (order.items ?? [])
      .map((item) => item?.variant_id)
      .filter((id): id is string => !!id)

    // Read from the variant side: a variant is a Voucher product when it has one linked.
    const { data: variants } = variantIds.length
      ? await query.graph({
          entity: "product_variant",
          fields: ["id", "voucher_product.id"],
          filters: { id: variantIds },
        })
      : { data: [] }
    const voucherVariantIds = new Set(
      variants.filter((variant) => variant.voucher_product?.id).map((variant) => variant.id)
    )

    const result: AllocateVouchersInput = {
      order_id: order.id,
      customer_id: order.customer_id ?? null,
      recipient_email: order.email ?? null,
      lines: (order.items ?? [])
        .filter((item) => item?.variant_id && voucherVariantIds.has(item.variant_id))
        .map((item) => ({
          order_line_item_id: item!.id,
          variant_id: item!.variant_id as string,
          // The ordered quantity lives on the order item detail, not on the line item itself.
          quantity: Number(item!.detail?.quantity),
        })),
    }

    return new StepResponse(result)
  }
)
