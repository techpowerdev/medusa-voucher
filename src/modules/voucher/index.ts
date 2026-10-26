import { Module } from "@medusajs/framework/utils"
import validateOptionsLoader from "./loaders/validate-options"
import VoucherModuleService from "./service"

export const VOUCHER_MODULE = "voucher"

export default Module(VOUCHER_MODULE, {
  service: VoucherModuleService,
  loaders: [validateOptionsLoader],
})
