import { Modules } from "@medusajs/framework/utils"
import { LocalNotificationService } from "@medusajs/notification-local/dist/services/local"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import { DeliveryStatus, VoucherStatus } from "../../src/modules/voucher/constants"
import VoucherModuleService from "../../src/modules/voucher/service"
import { VoucherCodeInput } from "../../src/modules/voucher/types"
import { allocateVouchersForPaidOrderWorkflow } from "../../src/workflows/allocate-vouchers-for-paid-order"
import {
  createOrder,
  createVoucherProductVariant,
  payOrderInFull,
  stockVouchers,
} from "../helpers/vouchers"

jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  medusaConfigFile: path.join(__dirname, ".."),
  testSuite: ({ getContainer }) => {
    describe("Delivery starts after allocation", () => {
      const service = (): VoucherModuleService => getContainer().resolve(VOUCHER_MODULE)

      afterEach(() => jest.restoreAllMocks())

      // Events reach subscribers asynchronously, so this waits for the order's Delivery to
      // reach `status`.
      const deliveryReaching = async (orderId: string, status: DeliveryStatus) => {
        for (let attempt = 0; attempt < 50; attempt++) {
          const [delivery] = await service().listVoucherDeliveries({ order_id: orderId })

          if (delivery?.status === status) {
            return delivery
          }

          await new Promise((resolve) => setTimeout(resolve, 200))
        }

        throw new Error(`The Delivery of order ${orderId} never became ${status}`)
      }

      const allocate = (orderId: string) =>
        allocateVouchersForPaidOrderWorkflow(getContainer()).run({ input: { order_id: orderId } })

      // The `voucher.allocated` messages handed to the event bus.
      const allocatedEvents = () => {
        const emit = jest.spyOn(getContainer().resolve(Modules.EVENT_BUS), "emit")

        return () =>
          emit.mock.calls
            .flatMap(([messages]) => (Array.isArray(messages) ? messages : [messages]))
            .filter((message) => message.name === "voucher.allocated")
      }

      // A Paid order for `quantity` units of a Voucher product stocked with `vouchers`.
      const paidOrder = async (quantity: number, vouchers: VoucherCodeInput[]) => {
        const product = await createVoucherProductVariant(getContainer())
        await stockVouchers(getContainer(), product, vouchers)
        const order = await createOrder(getContainer(), [{ variant_id: product.variantId, quantity }])
        await payOrderInFull(getContainer(), order.id, quantity * 100)

        return order
      }

      it("emits voucher.allocated once with the order id when an allocation creates Allocations", async () => {
        const order = await paidOrder(2, [{ code: "TRIG-0001" }, { code: "TRIG-0002" }])
        const events = allocatedEvents()

        await allocate(order.id)

        expect(events().map((message) => message.data)).toEqual([{ order_id: order.id }])
      })

      it("emits nothing when a repeated allocation returns the order's existing Allocations", async () => {
        const order = await paidOrder(1, [{ code: "TRIG-0003" }])
        await allocate(order.id)
        const events = allocatedEvents()

        await allocate(order.id)

        expect(events()).toEqual([])
      })

      it("emits nothing when the Pool is short and only Allocation failures are recorded", async () => {
        const order = await paidOrder(2, [{ code: "TRIG-0004" }])
        const events = allocatedEvents()

        await allocate(order.id)

        expect(events()).toEqual([])
      })

      it("emails the order's Vouchers once through the event after an allocation", async () => {
        const send = jest.spyOn(LocalNotificationService.prototype, "send")
        const order = await paidOrder(2, [{ code: "TRIG-0005" }, { code: "TRIG-0006" }])

        await allocate(order.id)

        const delivery = await deliveryReaching(order.id, DeliveryStatus.DELIVERED)
        expect(delivery.attempts).toBe(1)
        expect(send).toHaveBeenCalledTimes(1)
        expect(send.mock.calls[0][0]).toMatchObject({ to: "customer@example.test", channel: "email" })
      })

      it("keeps the Allocations when the email provider fails, recording a failed Delivery", async () => {
        jest
          .spyOn(LocalNotificationService.prototype, "send")
          .mockRejectedValue(new Error("SMTP 421 try again later"))
        const order = await paidOrder(2, [{ code: "TRIG-0007" }, { code: "TRIG-0008" }])

        const { result } = await allocate(order.id)

        expect(result?.allocated).toHaveLength(2)
        await deliveryReaching(order.id, DeliveryStatus.FAILED)
        const allocations = await service().listVoucherAllocations(
          { order_id: order.id },
          { relations: ["voucher"] }
        )
        expect(allocations.map((allocation) => allocation.voucher.status)).toEqual([
          VoucherStatus.ALLOCATED,
          VoucherStatus.ALLOCATED,
        ])
      })

      it("allocates even when delivery throws an error of its own", async () => {
        const reveal = jest
          .spyOn(service(), "revealVoucher")
          .mockRejectedValue(new Error("cannot decrypt"))
        const order = await paidOrder(1, [{ code: "TRIG-0009" }])

        const { result } = await allocate(order.id)

        expect(result?.allocated).toHaveLength(1)
        // Delivery did run (and throw) for the order, after the allocation had finished.
        for (let attempt = 0; attempt < 50 && !reveal.mock.calls.length; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 200))
        }
        expect(reveal).toHaveBeenCalled()
        expect(await service().listVoucherAllocations({ order_id: order.id })).toHaveLength(1)
      })
    })
  },
})
