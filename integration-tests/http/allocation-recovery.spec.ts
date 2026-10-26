import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import { AllocationFailureStatus } from "../../src/modules/voucher/constants"
import VoucherModuleService from "../../src/modules/voucher/service"
import { allocateVouchersForPaidOrderWorkflow } from "../../src/workflows/allocate-vouchers-for-paid-order"
import { recoverUnallocatedPaidOrdersWorkflow } from "../../src/workflows/recover-unallocated-paid-orders"
import { createVariant } from "../helpers/admin"
import {
  authorizeOrderPayment,
  createOrder,
  createVoucherProductVariant,
  stockVouchers,
} from "../helpers/vouchers"

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  medusaConfigFile: path.join(__dirname, ".."),
  testSuite: ({ getContainer }) => {
    describe("Recovery of Paid orders that were never allocated", () => {
      const service = (): VoucherModuleService => getContainer().resolve(VOUCHER_MODULE)
      // The window is measured from `now`, so a run "later" sees orders created just now.
      const recoverAt = (msFromNow: number) =>
        recoverUnallocatedPaidOrdersWorkflow(getContainer()).run({
          input: { now: new Date(Date.now() + msFromNow).toISOString() },
        })

      // A Paid order whose subscriber never allocated it: captured through the Payment
      // module, which emits no event.
      const strandedOrder = async (quantity = 2, title = "100") => {
        const product = await createVoucherProductVariant(getContainer(), title)
        await stockVouchers(getContainer(), product, [
          { code: `LOST-${title}-0001` },
          { code: `LOST-${title}-0002` },
          { code: `LOST-${title}-0003` },
        ])
        const order = await createOrder(getContainer(), [{ variant_id: product.variantId, quantity }])
        const payment = await authorizeOrderPayment(getContainer(), order.id, quantity * 100)
        await getContainer()
          .resolve(Modules.PAYMENT)
          .capturePayment({ payment_id: payment.id, amount: quantity * 100 })

        return { product, order }
      }

      it("allocates a Paid order with no Allocation or failure inside the window", async () => {
        const { order } = await strandedOrder()

        await recoverAt(11 * MINUTE)

        const allocations = await service().listVoucherAllocations({ order_id: order.id })
        expect(allocations.map((a) => a.unit_index).sort()).toEqual([1, 2])
      })

      it("works through the candidates a page at a time without losing any", async () => {
        const first = await strandedOrder(2, "100")
        const second = await strandedOrder(2, "200")

        const { result } = await recoverUnallocatedPaidOrdersWorkflow(getContainer()).run({
          input: { now: new Date(Date.now() + 11 * MINUTE).toISOString(), page_size: 1 },
        })

        expect(result.pages).toBe(2)
        expect(result.recovered.map((r) => r.order_id).sort()).toEqual([first.order.id, second.order.id].sort())
      })

      it("leaves an order younger than 10 minutes to its subscribers", async () => {
        const { order } = await strandedOrder()

        await recoverAt(5 * MINUTE)

        expect(await service().listVoucherAllocations({ order_id: order.id })).toEqual([])
      })

      describe("an order that already has an Allocation failure is the operator's", () => {
        // A short Pool records a failure; Vouchers imported afterwards would now cover it.
        const failedThenRestocked = async () => {
          const product = await createVoucherProductVariant(getContainer())
          const order = await createOrder(getContainer(), [{ variant_id: product.variantId, quantity: 2 }])
          const payment = await authorizeOrderPayment(getContainer(), order.id, 200)
          await getContainer().resolve(Modules.PAYMENT).capturePayment({ payment_id: payment.id, amount: 200 })
          await allocateVouchersForPaidOrderWorkflow(getContainer()).run({ input: { order_id: order.id } })
          await stockVouchers(getContainer(), product, [{ code: "LATE-0001" }, { code: "LATE-0002" }])

          return order
        }

        it("leaves an order with an open failure alone", async () => {
          const order = await failedThenRestocked()

          await recoverAt(11 * MINUTE)

          expect(await service().listVoucherAllocations({ order_id: order.id })).toEqual([])
        })

        it("leaves an order whose failure was resolved alone", async () => {
          const order = await failedThenRestocked()
          const [failure] = await service().listVoucherAllocationFailures({ order_id: order.id })
          await service().updateVoucherAllocationFailures({
            id: failure.id,
            status: AllocationFailureStatus.RESOLVED,
            resolved_at: new Date(),
            resolution_note: "Refunded by hand",
          })

          await recoverAt(11 * MINUTE)

          expect(await service().listVoucherAllocations({ order_id: order.id })).toEqual([])
        })
      })

      it("does not check a Paid order without Voucher product lines", async () => {
        const order = await createOrder(getContainer(), [
          { variant_id: await createVariant(getContainer(), "other"), quantity: 1 },
        ])
        const payment = await authorizeOrderPayment(getContainer(), order.id, 100)
        await getContainer().resolve(Modules.PAYMENT).capturePayment({ payment_id: payment.id, amount: 100 })

        const { result } = await recoverAt(11 * MINUTE)

        expect(result.checked).not.toContain(order.id)
      })

      it("leaves an order that is already allocated unchanged", async () => {
        const { order } = await strandedOrder()
        await allocateVouchersForPaidOrderWorkflow(getContainer()).run({ input: { order_id: order.id } })
        const before = await service().listVoucherAllocations({ order_id: order.id })

        await recoverAt(11 * MINUTE)

        const after = await service().listVoucherAllocations({ order_id: order.id })
        expect(after.map((a) => a.id).sort()).toEqual(before.map((a) => a.id).sort())
      })

      it("leaves an order that is not a Paid order alone", async () => {
        const product = await createVoucherProductVariant(getContainer())
        await stockVouchers(getContainer(), product, [{ code: "UNPAID-0001" }])
        const order = await createOrder(getContainer(), [{ variant_id: product.variantId, quantity: 1 }])
        await authorizeOrderPayment(getContainer(), order.id, 100)

        await recoverAt(11 * MINUTE)

        expect(await service().listVoucherAllocations({ order_id: order.id })).toEqual([])
        expect(await service().listVoucherAllocationFailures({ order_id: order.id })).toEqual([])
      })

      describe("reporting", () => {
        const logger = () => getContainer().resolve(ContainerRegistrationKeys.LOGGER)

        afterEach(() => jest.restoreAllMocks())

        it("logs each recovered order as a warning, without codes", async () => {
          const { order } = await strandedOrder()
          const warn = jest.spyOn(logger(), "warn")

          const { result } = await recoverAt(11 * MINUTE)

          expect(result.recovered).toContainEqual({ order_id: order.id, allocated: 2, failures: 0 })
          const messages = warn.mock.calls.map((call) => String(call[0]))
          expect(messages.filter((message) => message.includes(order.id))).toHaveLength(1)
          expect(messages.join("\n")).not.toMatch(/LOST-/)
        })

        it("logs an order whose recovery throws as an error and still recovers the others", async () => {
          const broken = await strandedOrder()
          const fine = await strandedOrder(2, "200")
          const allocateVouchers = service().allocateVouchers.bind(service())
          jest.spyOn(service(), "allocateVouchers").mockImplementation(async (input, context) => {
            if (input.order_id === broken.order.id) {
              throw new Error("database unavailable")
            }

            return allocateVouchers(input, context)
          })
          const error = jest.spyOn(logger(), "error")

          const { result } = await recoverAt(11 * MINUTE)

          expect(result.failed).toContain(broken.order.id)
          expect((await service().listVoucherAllocations({ order_id: fine.order.id })).length).toBe(2)
          const messages = error.mock.calls.map((call) => String(call[0]))
          const brokenMessages = messages.filter((message) => message.includes(broken.order.id))
          expect(brokenMessages).toHaveLength(1)
          expect(brokenMessages[0]).toContain("database unavailable")
        })
      })

      it("leaves an order older than 7 days alone", async () => {
        const { order } = await strandedOrder()

        await recoverAt(8 * DAY)

        expect(await service().listVoucherAllocations({ order_id: order.id })).toEqual([])
      })
    })
  },
})
