import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, PaymentEvents } from "@medusajs/framework/utils"
import { allocateVouchersForPaidOrderWorkflow } from "../workflows/allocate-vouchers-for-paid-order"

// The event carries only the payment id and fires on every capture, including a partial
// one; the workflow decides whether the order is now fully paid.
export default async function allocateVouchersOnPaymentCaptured({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: payments } = await query.graph({
    entity: "payment",
    fields: ["payment_collection_id"],
    filters: { id: data.id },
  })
  const paymentCollectionId = payments[0]?.payment_collection_id

  if (!paymentCollectionId) {
    return
  }

  // The same lookup Medusa's capture workflow uses to find the order of a payment.
  const { data: links } = await query.graph({
    entity: "order_payment_collection",
    fields: ["order_id"],
    filters: { payment_collection_id: paymentCollectionId },
  })
  const orderId = links[0]?.order_id

  if (!orderId) {
    return
  }

  await allocateVouchersForPaidOrderWorkflow(container).run({ input: { order_id: orderId } })
}

export const config: SubscriberConfig = {
  event: PaymentEvents.CAPTURED,
}
