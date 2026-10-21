import { MedusaService } from "@medusajs/framework/utils"
import AllocationFailure from "./models/allocation-failure"
import Voucher from "./models/voucher"
import VoucherAllocation from "./models/voucher-allocation"
import VoucherBatch from "./models/voucher-batch"

class VoucherModuleService extends MedusaService({
  Voucher,
  VoucherBatch,
  VoucherAllocation,
  AllocationFailure,
}) {}

export default VoucherModuleService
