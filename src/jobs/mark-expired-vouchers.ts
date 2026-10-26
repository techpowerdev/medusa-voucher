import { MedusaContainer } from "@medusajs/framework/types"
import { markExpiredVouchersWorkflow } from "../workflows/mark-expired-vouchers"

// Records as Expired the Available Vouchers whose Validity period has ended. The workflow logs
// how many; this job only starts it.
export default async function markExpiredVouchersJob(container: MedusaContainer) {
  await markExpiredVouchersWorkflow(container).run({ input: {} })
}

export const config = {
  name: "mark-expired-vouchers",
  schedule: "*/15 * * * *",
}
