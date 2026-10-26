import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework"
import { OrderWorkflowEvents } from "@medusajs/framework/utils"
import { allocateVouchersForPaidOrderWorkflow } from "../workflows/allocate-vouchers-for-paid-order"

// A provider that captures when authorizing (Stripe with `capture: true`) is captured inside
// the Payment module and emits no payment.captured, so a placed order may already be fully
// paid. One that is not yet paid is left to the payment.captured subscriber.
export default async function allocateVouchersOnOrderPlaced({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await allocateVouchersForPaidOrderWorkflow(container).run({ input: { order_id: data.id } })
}

export const config: SubscriberConfig = {
  event: OrderWorkflowEvents.PLACED,
}
