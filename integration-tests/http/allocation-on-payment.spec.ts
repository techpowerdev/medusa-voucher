import { Modules, OrderWorkflowEvents } from "@medusajs/framework/utils"
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import VoucherModuleService from "../../src/modules/voucher/service"
import { allocateVouchersForPaidOrderWorkflow } from "../../src/workflows/allocate-vouchers-for-paid-order"
import { createVariant } from "../helpers/admin"
import {
  authorizeOrderPayment,
  createOrder,
  createVoucherProductVariant,
  stockVouchers,
} from "../helpers/vouchers"

jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  medusaConfigFile: path.join(__dirname, ".."),
  testSuite: ({ getContainer }) => {
    describe("Allocation once an order is fully paid", () => {
      const service = (): VoucherModuleService => getContainer().resolve(VOUCHER_MODULE)
      const run = (orderId: string) =>
        allocateVouchersForPaidOrderWorkflow(getContainer()).run({ input: { order_id: orderId } })
      // Captures through the Payment module, which emits no event, so only the workflow
      // under test allocates.
      const capture = (paymentId: string, amount: number) =>
        getContainer().resolve(Modules.PAYMENT).capturePayment({ payment_id: paymentId, amount })

      const voucherOrder = async (quantity: number) => {
        const product = await createVoucherProductVariant(getContainer())
        await stockVouchers(getContainer(), product, [
          { code: "PAID-0001" },
          { code: "PAID-0002" },
          { code: "PAID-0003" },
        ])
        const order = await createOrder(getContainer(), [{ variant_id: product.variantId, quantity }])

        return { product, order, total: quantity * 100 }
      }

      it("allocates the order's Vouchers when its payment is fully captured", async () => {
        const { order, total } = await voucherOrder(2)
        const payment = await authorizeOrderPayment(getContainer(), order.id, total)
        await capture(payment.id, total)

        await run(order.id)

        const allocations = await service().listVoucherAllocations({ order_id: order.id })
        expect(allocations.map((a) => a.unit_index).sort()).toEqual([1, 2])
      })

      it("allocates nothing while the payment is only authorized", async () => {
        const { order, total } = await voucherOrder(2)
        await authorizeOrderPayment(getContainer(), order.id, total)

        await run(order.id)

        expect(await service().listVoucherAllocations({ order_id: order.id })).toEqual([])
        expect(await service().listAllocationFailures({ order_id: order.id })).toEqual([])
      })

      it("allocates nothing while the payment is only partly captured", async () => {
        const { order, total } = await voucherOrder(2)
        const payment = await authorizeOrderPayment(getContainer(), order.id, total)
        await capture(payment.id, total / 2)

        await run(order.id)

        expect(await service().listVoucherAllocations({ order_id: order.id })).toEqual([])
        expect(await service().listAllocationFailures({ order_id: order.id })).toEqual([])
      })

      it("allocates once when run twice for the same paid order", async () => {
        const { order, total } = await voucherOrder(2)
        const payment = await authorizeOrderPayment(getContainer(), order.id, total)
        await capture(payment.id, total)

        await run(order.id)
        await run(order.id)

        const allocations = await service().listVoucherAllocations({ order_id: order.id })
        expect(allocations.map((a) => a.unit_index).sort()).toEqual([1, 2])
      })

      it("leaves a paid order with no Voucher product lines alone", async () => {
        const order = await createOrder(getContainer(), [
          { variant_id: await createVariant(getContainer(), "other"), quantity: 1 },
        ])
        const payment = await authorizeOrderPayment(getContainer(), order.id, 100)
        await capture(payment.id, 100)

        const { result } = await run(order.id)

        expect(result).toEqual({ allocated: [], failures: [], created: false })
        expect(await service().listAllocationFailures({ order_id: order.id })).toEqual([])
      })

      describe("Paid order rule", () => {
        const zeroTotalOrder = async () => {
          const product = await createVoucherProductVariant(getContainer())
          await stockVouchers(getContainer(), product, [{ code: "FREE-0001" }, { code: "FREE-0002" }])

          return createOrder(getContainer(), [{ variant_id: product.variantId, quantity: 2, unit_price: 0 }])
        }

        it("allocates an order with a total of 0 and no payment collection", async () => {
          const order = await zeroTotalOrder()

          await run(order.id)

          const allocations = await service().listVoucherAllocations({ order_id: order.id })
          expect(allocations.map((a) => a.unit_index).sort()).toEqual([1, 2])
        })

        it("allocates nothing for an order that costs something and has no payment collection yet", async () => {
          const { order } = await voucherOrder(2)

          await run(order.id)

          expect(await service().listVoucherAllocations({ order_id: order.id })).toEqual([])
        })

        it("allocates nothing for a canceled order with a total of 0", async () => {
          const order = await zeroTotalOrder()
          await getContainer().resolve(Modules.ORDER).cancel(order.id)

          await run(order.id)

          expect(await service().listVoucherAllocations({ order_id: order.id })).toEqual([])
          expect(await service().listAllocationFailures({ order_id: order.id })).toEqual([])
        })

        it("allocates nothing for a canceled order whose payment was captured", async () => {
          const { order, total } = await voucherOrder(2)
          const payment = await authorizeOrderPayment(getContainer(), order.id, total)
          await capture(payment.id, total)
          await getContainer().resolve(Modules.ORDER).cancel(order.id)

          await run(order.id)

          expect(await service().listVoucherAllocations({ order_id: order.id })).toEqual([])
          expect(await service().listAllocationFailures({ order_id: order.id })).toEqual([])
        })
      })

      // Events reach subscribers asynchronously, so these wait for the Allocations to appear.
      describe("started by events", () => {
        const allocationsOf = async (orderId: string) => {
          const deadline = Date.now() + 15 * 1000
          let allocations = await service().listVoucherAllocations({ order_id: orderId })

          while (!allocations.length && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 200))
            allocations = await service().listVoucherAllocations({ order_id: orderId })
          }

          return allocations
        }

        it("allocates when a capture through Medusa's capture workflow pays the order in full", async () => {
          const { order, total } = await voucherOrder(2)
          const payment = await authorizeOrderPayment(getContainer(), order.id, total)

          await capturePaymentWorkflow(getContainer()).run({ input: { payment_id: payment.id } })

          const allocations = await allocationsOf(order.id)
          expect(allocations.map((a) => a.unit_index).sort()).toEqual([1, 2])
        })

        // A provider that captures when authorizing emits no payment.captured; the order is
        // already paid when order.placed is released at the end of cart completion.
        it("allocates when an order that is already fully paid is placed", async () => {
          const { order, total } = await voucherOrder(2)
          const payment = await authorizeOrderPayment(getContainer(), order.id, total)
          await capture(payment.id, total)

          await getContainer()
            .resolve(Modules.EVENT_BUS)
            .emit({ name: OrderWorkflowEvents.PLACED, data: { id: order.id } })

          const allocations = await allocationsOf(order.id)
          expect(allocations.map((a) => a.unit_index).sort()).toEqual([1, 2])
        })
      })
    })
  },
})
