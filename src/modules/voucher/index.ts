import { Module } from "@medusajs/framework/utils"
import VoucherModuleService from "./service"

export const VOUCHER_MODULE = "voucher"

export default Module(VOUCHER_MODULE, {
  service: VoucherModuleService,
})
