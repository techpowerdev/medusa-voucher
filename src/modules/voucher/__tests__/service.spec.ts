import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { VOUCHER_MODULE } from ".."
import {
  AllocationFailureStatus,
  DeliveryChannel,
  DeliveryStatus,
  VoucherStatus,
} from "../constants"
import AllocationFailure from "../models/allocation-failure"
import Voucher from "../models/voucher"
import VoucherAllocation from "../models/voucher-allocation"
import VoucherBatch from "../models/voucher-batch"
import VoucherDelivery from "../models/voucher-delivery"
import VoucherProduct from "../models/voucher-product"
import VoucherModuleService from "../service"

jest.setTimeout(60 * 1000)

const batchInput = {
  voucher_product_id: "vprod_100",
  variant_id: "variant_100",
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
  moduleModels: [
    Voucher,
    VoucherBatch,
    VoucherProduct,
    VoucherAllocation,
    AllocationFailure,
    VoucherDelivery,
  ],
  resolve: "./src/modules/voucher",
  moduleOptions: { encryptionKey: "Xk3vQ9mZ2tLw7RfB5nYc8HdJ1sGpA4uE" },
  testSuite: ({ service }) => {
    describe("VoucherModuleService", () => {
      it("stores a Voucher product and refuses a Face value that is not positive", async () => {
        const stored = await service.createVoucherProducts({ face_value: 100, currency_code: "thb" })

        expect(Number(stored.face_value)).toBe(100)
        await expect(
          service.createVoucherProducts({ face_value: 0, currency_code: "thb" })
        ).rejects.toThrow()
        await expect(
          service.createVoucherProducts({ face_value: -5, currency_code: "thb" })
        ).rejects.toThrow()
      })

      it("keeps only what varies per purchase on a batch: no Partner, Face value or currency", async () => {
        const batch = await service.createVoucherBatches(batchInput)
        const stored = await service.retrieveVoucherBatch(batch.id)

        expect(stored).toEqual(
          expect.objectContaining({
            voucher_product_id: "vprod_100",
            variant_id: "variant_100",
            reference: "PO-1",
          })
        )
        expect(Number(stored.unit_cost)).toBe(92)
        for (const removed of ["partner", "face_value", "currency_code"]) {
          expect(stored).not.toHaveProperty(removed)
        }
      })

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

      describe("claiming a Delivery for sending", () => {
        const claim = (recipient = "customer@example.test") =>
          service.claimDelivery({ order_id: "order_1", channel: DeliveryChannel.EMAIL, recipient })

        it("creates the order's Delivery on the channel and claims it", async () => {
          const claimed = await claim()

          expect(claimed).toEqual(
            expect.objectContaining({
              order_id: "order_1",
              channel: DeliveryChannel.EMAIL,
              recipient: "customer@example.test",
              status: DeliveryStatus.SENDING,
              attempts: 1,
            })
          )
          expect(await service.listVoucherDeliveries({ order_id: "order_1" })).toHaveLength(1)
        })

        it("claims a failed Delivery again, counting the attempt and taking the new recipient", async () => {
          const first = await claim()
          await service.updateVoucherDeliveries({ id: first!.id, status: DeliveryStatus.FAILED })

          const again = await claim("new@example.test")

          expect(again).toEqual(
            expect.objectContaining({
              id: first!.id,
              status: DeliveryStatus.SENDING,
              attempts: 2,
              recipient: "new@example.test",
            })
          )
        })

        it("refuses a Delivery that is being sent or was delivered", async () => {
          const first = await claim()
          expect(await claim()).toBeNull()

          await service.updateVoucherDeliveries({ id: first!.id, status: DeliveryStatus.DELIVERED })
          expect(await claim()).toBeNull()
          const [stored] = await service.listVoucherDeliveries({ id: first!.id })
          expect(stored.attempts).toBe(1)
        })

        it("lets only one of two concurrent claims succeed", async () => {
          const results = await Promise.all([claim(), claim()])

          expect(results.filter(Boolean)).toHaveLength(1)
          const deliveries = await service.listVoucherDeliveries({ order_id: "order_1" })
          expect(deliveries).toHaveLength(1)
          expect(deliveries[0].attempts).toBe(1)
        })

        it("keeps one Delivery per order and channel", async () => {
          await claim()

          await expect(
            service.createVoucherDeliveries({ order_id: "order_1", channel: DeliveryChannel.EMAIL })
          ).rejects.toThrow()
        })
      })

      it("allocates a voucher to an order line item once", async () => {
        const batch = await service.createVoucherBatches(batchInput)
        const voucher = await service.createVouchers(voucherInput(1, batch.id))

        const allocation = await service.createVoucherAllocations({
          voucher_id: voucher.id,
          order_id: "order_1",
          order_line_item_id: "item_1",
          unit_index: 1,
        })

        expect(allocation).toEqual(expect.objectContaining({ voucher_id: voucher.id, unit_index: 1 }))

        await expect(
          service.createVoucherAllocations({
            voucher_id: voucher.id,
            order_id: "order_2",
            order_line_item_id: "item_2",
            unit_index: 1,
          })
        ).rejects.toThrow()
      })

      it("serves each unit of a line item once, except that a Replacement may serve it again", async () => {
        const batch = await service.createVoucherBatches(batchInput)
        const [first, second, third] = await service.createVouchers([
          voucherInput(1, batch.id),
          voucherInput(2, batch.id),
          voucherInput(3, batch.id),
        ])
        const unit = { order_id: "order_1", order_line_item_id: "item_1", unit_index: 1 }

        const original = await service.createVoucherAllocations({ ...unit, voucher_id: first.id })

        await expect(
          service.createVoucherAllocations({ ...unit, voucher_id: second.id })
        ).rejects.toThrow()

        await expect(
          service.createVoucherAllocations({
            ...unit,
            voucher_id: third.id,
            replaces_allocation_id: original.id,
            replacement_reason: "Code rejected by partner",
          })
        ).resolves.toEqual(expect.objectContaining({ unit_index: 1 }))
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

        it("imports thousands of codes in one call", async () => {
          const batch = await createBatch()
          const vouchers = Array.from({ length: 2500 }, (_, i) => ({
            code: `BULK-${String(i).padStart(6, "0")}-CODE`,
          }))

          const created = await service.createVouchersFromCodes({
            batch_id: batch.id,
            vouchers,
          })

          expect(created).toHaveLength(2500)
          expect(await service.listVouchers({}, { take: null })).toHaveLength(2500)

          await expect(
            service.createVouchersFromCodes({
              batch_id: batch.id,
              vouchers: [{ code: "FRESH-CODE-0001" }, vouchers[2400]],
            })
          ).rejects.toThrow("Codes already stored at positions: 2")
        })

        it("lets exactly one of two concurrent imports of the same code win", async () => {
          const batch = await createBatch()
          const runImport = () =>
            service.createVouchersFromCodes({
              batch_id: batch.id,
              vouchers: [{ code: "RACE-CODE-0001" }],
            })

          const results = await Promise.allSettled([runImport(), runImport()])
          const failures = results.filter((r) => r.status === "rejected")

          expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
          expect(failures).toHaveLength(1)
          const { type, message } = (failures[0] as PromiseRejectedResult).reason

          expect(type).toBe("invalid_data")
          expect(message).toMatch(/already stored|stored by another import/)
          expect(message).not.toContain("code_hash")
          expect(await service.listVouchers({})).toHaveLength(1)
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
            "Voucher 2 ends (valid_until) at or before it starts (valid_from)"
          )

          expect(await service.listVouchers({})).toHaveLength(0)
        })

        it("accepts open-ended periods and rejects an empty one", async () => {
          const batch = await createBatch()
          const instant = new Date("2026-06-01")

          const created = await service.createVouchersFromCodes({
            batch_id: batch.id,
            vouchers: [
              { code: "ONLY-FROM-0001", valid_from: instant },
              { code: "ONLY-UNTIL-0002", valid_until: instant },
            ],
          })

          expect(created).toHaveLength(2)

          await expect(
            service.createVouchersFromCodes({
              batch_id: batch.id,
              vouchers: [
                { code: "SAME-INSTANT-0003", valid_from: instant, valid_until: instant },
              ],
            })
          ).rejects.toThrow("at or before it starts")
        })

        it("rejects an empty validity period at the database", async () => {
          const batch = await createBatch()

          await expect(
            service.createVouchers({
              ...voucherInput(9, batch.id),
              valid_from: new Date("2026-12-01"),
              valid_until: new Date("2026-12-01"),
            })
          ).rejects.toThrow()
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

        it("names the source line instead of the position when given", async () => {
          const batch = await createBatch()

          await expect(
            service.createVouchersFromCodes({
              batch_id: batch.id,
              vouchers: [
                { code: "OK-0001", source_line: 2 },
                { code: "OK-0001", source_line: 7 },
              ],
            })
          ).rejects.toThrow("Repeated codes at lines: 7")
        })
      })
    })
  },
})
