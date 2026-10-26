import { MedusaContainer } from "@medusajs/framework/types"
import { recoverUnallocatedPaidOrdersWorkflow } from "../workflows/recover-unallocated-paid-orders"

// Catches Paid orders whose subscriber threw or whose event never arrived. The workflow logs
// what it recovers and what it could not; this job only starts it.
export default async function recoverUnallocatedPaidOrdersJob(container: MedusaContainer) {
  await recoverUnallocatedPaidOrdersWorkflow(container).run({ input: {} })
}

export const config = {
  name: "recover-unallocated-voucher-orders",
  schedule: "*/15 * * * *",
}
