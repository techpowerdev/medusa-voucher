import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework"
import { VOUCHER_MODULE } from "../modules/voucher"
import { VoucherEvents } from "../modules/voucher/constants"
import VoucherModuleService from "../modules/voucher/service"
import { deliverOrderVouchersWorkflow } from "../workflows/deliver-order-vouchers"

// Runs after the allocation has committed, so a slow or failing email provider never holds
// up or rolls back the Allocations; a failed send is recorded on the Delivery.
export default async function deliverVouchersOnAllocated({
  event: { data },
  container,
}: SubscriberArgs<{ order_id: string }>) {
  const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)

  // With `delivery.automatic` off the store sends by calling the workflow itself.
  if (!(await service.getDeliverySettings()).automatic) {
    return
  }

  await deliverOrderVouchersWorkflow(container).run({ input: { order_id: data.order_id } })
}

export const config: SubscriberConfig = {
  event: VoucherEvents.ALLOCATED,
}
