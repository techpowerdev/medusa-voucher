import { MedusaContainer } from "@medusajs/framework/types"
import { retryVoucherDeliveriesWorkflow } from "../workflows/retry-voucher-deliveries"

// Tries failed and interrupted Deliveries again and sends Paid orders whose Delivery never
// started. The workflow logs what it does; this job only starts it.
export default async function retryVoucherDeliveriesJob(container: MedusaContainer) {
  await retryVoucherDeliveriesWorkflow(container).run({ input: {} })
}

export const config = {
  name: "retry-voucher-deliveries",
  schedule: "*/15 * * * *",
}
