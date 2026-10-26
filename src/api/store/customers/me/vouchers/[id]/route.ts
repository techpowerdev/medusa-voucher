import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import QRCode from "qrcode"
import { VOUCHER_MODULE } from "../../../../../../modules/voucher"
import VoucherModuleService from "../../../../../../modules/voucher/service"
import { customerVoucherViews } from "../customer-voucher-view"

// One of the signed-in customer's own Vouchers in full: its code, its PIN and a QR code of the
// code alone, generated now and never stored, as the email does. Another customer's, a Void
// or an unknown Voucher is not found.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const service: VoucherModuleService = req.scope.resolve(VOUCHER_MODULE)
  const voucher = await service.retrieveCustomerVoucher(req.auth_context.actor_id, req.params.id)
  const [view] = await customerVoucherViews(req.scope, [voucher])
  const { code, pin } = await service.revealVoucher(voucher.id)

  res.json({
    voucher: {
      ...view,
      code,
      pin,
      qr_code: await QRCode.toDataURL(code, { type: "image/png" }),
    },
  })
}
