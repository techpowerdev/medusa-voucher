import { MedusaService } from "@medusajs/framework/utils"
import Voucher from "./models/voucher"

class VoucherModuleService extends MedusaService({
  Voucher,
}) {}

export default VoucherModuleService
