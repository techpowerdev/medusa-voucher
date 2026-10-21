import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { VOUCHER_MODULE } from ".."
import AllocationFailure from "../models/allocation-failure"
import Voucher from "../models/voucher"
import VoucherAllocation from "../models/voucher-allocation"
import VoucherBatch from "../models/voucher-batch"
import VoucherModuleService from "../service"

jest.setTimeout(60 * 1000)

const batchInput = {
  partner: "Example Partner",
  variant_id: "variant_100",
  face_value: 100,
  currency_code: "thb",
  unit_cost: 92,
  purchased_at: new Date("2026-01-01"),
  reference: "PO-1",
}

const voucherInput = (n: number, batch_id: string) => ({
  code_encrypted: `encrypted-${n}`,
  code_hash: `hash-${n}`,
  code_hint: `0${n}`,
  variant_id: "variant_100",
  batch_id,
})

moduleIntegrationTestRunner<VoucherModuleService>({
  moduleName: VOUCHER_MODULE,
  moduleModels: [Voucher, VoucherBatch, VoucherAllocation, AllocationFailure],
  resolve: "./src/modules/voucher",
  testSuite: ({ service }) => {
    describe("VoucherModuleService", () => {
      it("imports a batch of vouchers that start as available", async () => {
        const batch = await service.createVoucherBatches(batchInput)
        await service.createVouchers([
          voucherInput(1, batch.id),
          voucherInput(2, batch.id),
        ])

        const vouchers = await service.listVouchers({
          variant_id: "variant_100",
          status: "available",
        })

        expect(vouchers).toHaveLength(2)
        expect(vouchers[0].valid_from).toBeNull()
        expect(vouchers[0].valid_until).toBeNull()
      })

      it("stores a validity period, a PIN and void details", async () => {
        const batch = await service.createVoucherBatches({
          ...batchInput,
          redemption_instructions: "Show the code at the counter",
          imported_by: "user_1",
        })
        const voucher = await service.createVouchers({
          ...voucherInput(1, batch.id),
          pin_encrypted: "encrypted-pin",
          valid_from: new Date("2026-02-01"),
          valid_until: new Date("2026-08-01"),
        })

        const voided = await service.updateVouchers({
          id: voucher.id,
          status: "void",
          void_reason: "Code rejected by partner",
          voided_at: new Date("2026-03-01"),
          voided_by: "user_1",
        })

        expect(voided.valid_from).toEqual(new Date("2026-02-01"))
        expect(voided.valid_until).toEqual(new Date("2026-08-01"))
        expect(voided.pin_encrypted).toBe("encrypted-pin")
        expect(voided.status).toBe("void")
        expect(voided.void_reason).toBe("Code rejected by partner")
      })

      it("rejects a voucher whose code hash already exists", async () => {
        const batch = await service.createVoucherBatches(batchInput)
        await service.createVouchers(voucherInput(1, batch.id))

        await expect(
          service.createVouchers(voucherInput(1, batch.id))
        ).rejects.toThrow()
      })

      it("allocates a voucher to an order line item once", async () => {
        const batch = await service.createVoucherBatches(batchInput)
        const voucher = await service.createVouchers(voucherInput(1, batch.id))

        const allocation = await service.createVoucherAllocations({
          voucher_id: voucher.id,
          order_id: "order_1",
          order_line_item_id: "item_1",
        })

        expect(allocation.delivery_status).toBe("pending")
        expect(allocation.delivery_channel).toBe("email")
        expect(allocation.delivery_attempts).toBe(0)

        await expect(
          service.createVoucherAllocations({
            voucher_id: voucher.id,
            order_id: "order_2",
            order_line_item_id: "item_2",
          })
        ).rejects.toThrow()
      })

      it("records an open allocation failure", async () => {
        const failure = await service.createAllocationFailures({
          order_id: "order_1",
          order_line_item_id: "item_1",
          variant_id: "variant_100",
          quantity_requested: 3,
          quantity_available: 2,
        })

        expect(failure.status).toBe("open")
        expect(failure.resolved_at).toBeNull()
      })
    })
  },
})
