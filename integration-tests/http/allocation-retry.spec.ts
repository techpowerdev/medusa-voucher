import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import { AllocationFailureStatus } from "../../src/modules/voucher/constants"
import VoucherModuleService from "../../src/modules/voucher/service"
import { allocateVouchersForPaidOrderWorkflow } from "../../src/workflows/allocate-vouchers-for-paid-order"
import { retryAllocationFailuresWorkflow } from "../../src/workflows/retry-allocation-failures"
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
    describe("Retrying Allocation failures", () => {
      const service = (): VoucherModuleService => getContainer().resolve(VOUCHER_MODULE)
      const retry = (voucherProductId: string) =>
        retryAllocationFailuresWorkflow(getContainer()).run({
          input: { voucher_product_id: voucherProductId },
        })

      // A Paid order that found the Pool short, so it waits on an open failure.
      const waitingOrder = async (product: { variantId: string }, quantity: number) => {
        const order = await createOrder(getContainer(), [{ variant_id: product.variantId, quantity }])
        await payOrderInFull(getContainer(), order.id, quantity * 100)
        await allocateVouchersForPaidOrderWorkflow(getContainer()).run({ input: { order_id: order.id } })

        return order
      }

      it("allocates a waiting order once the Pool has enough and resolves its failure", async () => {
        const product = await createVoucherProductVariant(getContainer())
        const order = await waitingOrder(product, 2)
        await stockVouchers(getContainer(), product, [{ code: "RETRY-0001" }, { code: "RETRY-0002" }])

        await retry(product.voucherProductId)

        const allocations = await service().listVoucherAllocations({ order_id: order.id })
        expect(allocations.map((a) => a.unit_index).sort()).toEqual([1, 2])
        const [failure] = await service().listAllocationFailures({ order_id: order.id })
        expect(failure).toEqual(
          expect.objectContaining({ status: AllocationFailureStatus.RESOLVED, resolved_by: "system" })
        )
        expect(failure.resolved_at).toBeTruthy()
      })

      it("serves the oldest waiting order first when the Pool covers only one", async () => {
        const product = await createVoucherProductVariant(getContainer())
        const older = await waitingOrder(product, 2)
        const newer = await waitingOrder(product, 2)
        await stockVouchers(getContainer(), product, [{ code: "ORDER-0001" }, { code: "ORDER-0002" }])

        const { result } = await retry(product.voucherProductId)

        expect(result).toEqual({ allocated: [older.id], still_open: [newer.id], failed: [] })
        expect(await service().listVoucherAllocations({ order_id: newer.id })).toEqual([])
        const [stillWaiting] = await service().listAllocationFailures({ order_id: newer.id })
        expect(stillWaiting.status).toBe(AllocationFailureStatus.OPEN)
      })

      it("allocates nothing extra when retried twice", async () => {
        const product = await createVoucherProductVariant(getContainer())
        const order = await waitingOrder(product, 1)
        await stockVouchers(getContainer(), product, [{ code: "TWICE-0001" }, { code: "TWICE-0002" }])

        await retry(product.voucherProductId)
        const { result } = await retry(product.voucherProductId)

        expect(result).toEqual({ allocated: [], still_open: [], failed: [] })
        expect(await service().listVoucherAllocations({ order_id: order.id })).toHaveLength(1)
      })

      it("still tries the later orders when one throws, and reports it as failed", async () => {
        const product = await createVoucherProductVariant(getContainer())
        const broken = await waitingOrder(product, 1)
        const fine = await waitingOrder(product, 1)
        await stockVouchers(getContainer(), product, [{ code: "ISO-0001" }, { code: "ISO-0002" }])
        const allocateVouchers = service().allocateVouchers.bind(service())
        jest.spyOn(service(), "allocateVouchers").mockImplementation(async (input, context) => {
          if (input.order_id === broken.id) {
            throw new Error("database unavailable")
          }

          return allocateVouchers(input, context)
        })
        const error = jest.spyOn(getContainer().resolve(ContainerRegistrationKeys.LOGGER), "error")

        const { result } = await retry(product.voucherProductId)

        expect(result).toEqual({ allocated: [fine.id], still_open: [], failed: [broken.id] })
        const messages = error.mock.calls.map((call) => String(call[0]))
        expect(messages.filter((m) => m.includes(broken.id) && m.includes("database unavailable"))).toHaveLength(1)
        jest.restoreAllMocks()
      })

      it("leaves the failure of an order canceled while it waited open", async () => {
        const product = await createVoucherProductVariant(getContainer())
        const order = await waitingOrder(product, 1)
        await getContainer().resolve(Modules.ORDER).cancel(order.id)
        await stockVouchers(getContainer(), product, [{ code: "GONE-0001" }])

        const { result } = await retry(product.voucherProductId)

        expect(result).toEqual({ allocated: [], still_open: [order.id], failed: [] })
        expect(await service().listVoucherAllocations({ order_id: order.id })).toEqual([])
        const [failure] = await service().listAllocationFailures({ order_id: order.id })
        expect(failure.status).toBe(AllocationFailureStatus.OPEN)
      })
    })
  },
})
