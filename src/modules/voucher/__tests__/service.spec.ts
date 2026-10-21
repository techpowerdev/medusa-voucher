import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { VOUCHER_MODULE } from ".."
import { AllocationFailureStatus, DeliveryStatus, VoucherStatus } from "../constants"
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
  moduleOptions: { encryptionKey: "k".repeat(32) },
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
          status: VoucherStatus.AVAILABLE,
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
          status: VoucherStatus.VOID,
          void_reason: "Code rejected by partner",
          voided_at: new Date("2026-03-01"),
          voided_by: "user_1",
        })

        expect(voided.valid_from).toEqual(new Date("2026-02-01"))
        expect(voided.valid_until).toEqual(new Date("2026-08-01"))
        expect(voided.pin_encrypted).toBe("encrypted-pin")
        expect(voided.status).toBe(VoucherStatus.VOID)
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

        expect(allocation.delivery_status).toBe(DeliveryStatus.PENDING)
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

        expect(failure.status).toBe(AllocationFailureStatus.OPEN)
        expect(failure.resolved_at).toBeNull()
      })

      describe("createVouchersFromCodes", () => {
        const createBatch = () => service.createVoucherBatches(batchInput)

        it("stores codes and PINs encrypted and reveals them on demand", async () => {
          const batch = await createBatch()

          const [voucher] = await service.createVouchersFromCodes({
            batch_id: batch.id,
            vouchers: [
              {
                code: "  ABCD-1234-EFGH ",
                pin: "9876",
                valid_until: new Date("2026-12-31"),
              },
            ],
          })

          expect(voucher.status).toBe(VoucherStatus.AVAILABLE)
          expect(voucher.code_hint).toBe("EFGH")
          expect(voucher.valid_until).toEqual(new Date("2026-12-31"))
          expect(JSON.stringify(voucher)).not.toContain("ABCD-1234")
          expect(JSON.stringify(voucher)).not.toContain("9876")

          expect(await service.revealVoucher(voucher.id)).toEqual({
            code: "ABCD-1234-EFGH",
            pin: "9876",
          })
        })

        it("reveals a null PIN when the voucher has none", async () => {
          const batch = await createBatch()
          const [voucher] = await service.createVouchersFromCodes({
            batch_id: batch.id,
            vouchers: [{ code: "NOPIN-CODE-0001" }],
          })

          expect(voucher.pin_encrypted).toBeNull()
          expect((await service.revealVoucher(voucher.id)).pin).toBeNull()
        })

        it("takes the variant from the batch", async () => {
          const batch = await service.createVoucherBatches({
            ...batchInput,
            variant_id: "variant_500",
          })
          const [voucher] = await service.createVouchersFromCodes({
            batch_id: batch.id,
            vouchers: [{ code: "VARIANT-FROM-BATCH" }],
          })

          expect(voucher.variant_id).toBe("variant_500")
          expect(voucher.batch_id).toBe(batch.id)
        })

        it("rejects a validity period that ends before it starts", async () => {
          const batch = await createBatch()

          await expect(
            service.createVouchersFromCodes({
              batch_id: batch.id,
              vouchers: [
                { code: "OK-PERIOD-0001", valid_until: new Date("2026-06-01") },
                {
                  code: "BAD-PERIOD-0002",
                  valid_from: new Date("2026-12-01"),
                  valid_until: new Date("2026-01-01"),
                },
              ],
            })
          ).rejects.toThrow(
            "Voucher 2 ends (valid_until) before it starts (valid_from)"
          )

          expect(await service.listVouchers({})).toHaveLength(0)
        })

        it("accepts open-ended periods and a period of a single instant", async () => {
          const batch = await createBatch()
          const instant = new Date("2026-06-01")

          const created = await service.createVouchersFromCodes({
            batch_id: batch.id,
            vouchers: [
              { code: "ONLY-FROM-0001", valid_from: instant },
              { code: "ONLY-UNTIL-0002", valid_until: instant },
              { code: "SAME-INSTANT-0003", valid_from: instant, valid_until: instant },
            ],
          })

          expect(created).toHaveLength(3)
        })

        it("rejects an unknown batch and creates nothing", async () => {
          await expect(
            service.createVouchersFromCodes({
              batch_id: "vbatch_missing",
              vouchers: [{ code: "ANY-CODE-0001" }],
            })
          ).rejects.toThrow(/vbatch_missing/)

          expect(await service.listVouchers({})).toHaveLength(0)
        })

        it("rejects the whole call when a code repeats in the input", async () => {
          const batch = await createBatch()

          await expect(
            service.createVouchersFromCodes({
              batch_id: batch.id,
              vouchers: [{ code: "AAA-111" }, { code: "BBB-222" }, { code: " AAA-111" }],
            })
          ).rejects.toThrow("Repeated codes at positions: 3")

          expect(await service.listVouchers({})).toHaveLength(0)
        })

        it("rejects the whole call when a code is already stored", async () => {
          const batch = await createBatch()
          await service.createVouchersFromCodes({
            batch_id: batch.id,
            vouchers: [{ code: "STORED-0001" }],
          })

          await expect(
            service.createVouchersFromCodes({
              batch_id: batch.id,
              vouchers: [{ code: "NEW-0002" }, { code: "STORED-0001" }],
            })
          ).rejects.toThrow("Codes already stored at positions: 2")

          expect(await service.listVouchers({})).toHaveLength(1)
        })

        it("rejects an empty code without echoing any code", async () => {
          const batch = await createBatch()

          await expect(
            service.createVouchersFromCodes({
              batch_id: batch.id,
              vouchers: [{ code: "OK-0001" }, { code: "   " }],
            })
          ).rejects.toThrow("Voucher 2 has an empty code")
        })
      })
    })
  },
})
