import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { AllocationFailureStatus } from "../../src/modules/voucher/constants"
import { VoucherStatus } from "../../src/modules/voucher/constants"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import VoucherModuleService from "../../src/modules/voucher/service"
import { allocateVouchersToOrderWorkflow } from "../../src/workflows/allocate-vouchers-to-order"
import { createVariant } from "../helpers/admin"
import { createOrder, createVoucherProductVariant, stockVouchers } from "../helpers/vouchers"

const DAY = 24 * 60 * 60 * 1000
const inDays = (days: number) => new Date(Date.now() + days * DAY)

jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  medusaConfigFile: path.join(__dirname, ".."),
  testSuite: ({ getContainer }) => {
    describe("Voucher allocation", () => {
      const service = (): VoucherModuleService => getContainer().resolve(VOUCHER_MODULE)
      const allocate = (orderId: string) =>
        allocateVouchersToOrderWorkflow(getContainer()).run({ input: { order_id: orderId } })

      it("allocates one Available Voucher per purchased unit and marks it Allocated", async () => {
        const product = await createVoucherProductVariant(getContainer())
        await stockVouchers(getContainer(), product, [
          { code: "ALLOC-0001" },
          { code: "ALLOC-0002" },
          { code: "ALLOC-0003" },
        ])
        const order = await createOrder(getContainer(), [
          { variant_id: product.variantId, quantity: 2 },
        ])

        const { result } = await allocate(order.id)

        expect(result.allocated).toHaveLength(2)
        expect(result.failures).toEqual([])
        expect(result.allocated.map((a) => a.unit_index).sort()).toEqual([1, 2])

        const allocations = await service().listVoucherAllocations({ order_id: order.id })
        expect(allocations).toHaveLength(2)
        expect(allocations[0]).toEqual(
          expect.objectContaining({
            order_line_item_id: order.items![0].id,
            recipient_email: "customer@example.test",
          })
        )

        const vouchers = await service().listVouchers({ variant_id: product.variantId })
        expect(vouchers.filter((v) => v.status === VoucherStatus.ALLOCATED)).toHaveLength(2)
        expect(vouchers.filter((v) => v.status === VoucherStatus.AVAILABLE)).toHaveLength(1)
        expect(JSON.stringify(result)).not.toMatch(/ALLOC-000|code_encrypted|code_hash/)
      })

      it("allocates nothing and records an open failure when the Pool is short", async () => {
        const product = await createVoucherProductVariant(getContainer())
        await stockVouchers(getContainer(), product, [{ code: "SHORT-0001" }])
        const order = await createOrder(getContainer(), [{ variant_id: product.variantId, quantity: 3 }])

        const { result } = await allocate(order.id)

        expect(result.allocated).toEqual([])
        expect(result.failures).toEqual([
          expect.objectContaining({ variant_id: product.variantId, requested: 3, available: 1 }),
        ])
        expect(await service().listVoucherAllocations({ order_id: order.id })).toHaveLength(0)
        expect((await service().listVouchers({ variant_id: product.variantId }))[0].status).toBe(
          VoucherStatus.AVAILABLE
        )

        const failures = await service().listAllocationFailures({ order_id: order.id })
        expect(failures).toEqual([
          expect.objectContaining({
            order_line_item_id: order.items![0].id,
            quantity_requested: 3,
            quantity_available: 1,
            status: AllocationFailureStatus.OPEN,
          }),
        ])
      })

      it("allocates none of an order's lines when only one of them is short", async () => {
        const plenty = await createVoucherProductVariant(getContainer(), "100")
        const scarce = await createVoucherProductVariant(getContainer(), "500")
        await stockVouchers(getContainer(), plenty, [{ code: "PLENTY-0001" }, { code: "PLENTY-0002" }])
        await stockVouchers(getContainer(), scarce, [{ code: "SCARCE-0001" }])
        const order = await createOrder(getContainer(), [
          { variant_id: plenty.variantId, quantity: 2 },
          { variant_id: scarce.variantId, quantity: 2 },
        ])

        const { result } = await allocate(order.id)

        expect(result.allocated).toEqual([])
        expect(result.failures.map((f) => f.variant_id)).toEqual([scarce.variantId])
        const allocated = (await service().listVouchers({})).filter(
          (v) => v.status !== VoucherStatus.AVAILABLE
        )
        expect(allocated).toEqual([])
      })

      it("ignores lines for variants that are not Voucher products", async () => {
        const voucher = await createVoucherProductVariant(getContainer())
        const ordinaryVariantId = await createVariant(getContainer(), "ordinary")
        await stockVouchers(getContainer(), voucher, [{ code: "MIXED-0001" }])
        const order = await createOrder(getContainer(), [
          { variant_id: ordinaryVariantId, quantity: 5 },
          { variant_id: voucher.variantId, quantity: 1 },
        ])

        const { result } = await allocate(order.id)

        expect(result.failures).toEqual([])
        expect(result.allocated).toHaveLength(1)
        const voucherLine = order.items!.find((item) => item.variant_id === voucher.variantId)
        expect(result.allocated[0].order_line_item_id).toBe(voucherLine!.id)
      })

      it("does nothing for an order without any Voucher product line", async () => {
        const ordinaryVariantId = await createVariant(getContainer(), "ordinary")
        const order = await createOrder(getContainer(), [{ variant_id: ordinaryVariantId, quantity: 1 }])

        const { result } = await allocate(order.id)

        expect(result).toEqual({ allocated: [], failures: [] })
        expect(await service().listAllocationFailures({ order_id: order.id })).toEqual([])
      })

      it("records a failure for a Voucher product that has no Vouchers at all", async () => {
        const product = await createVoucherProductVariant(getContainer())
        const order = await createOrder(getContainer(), [{ variant_id: product.variantId, quantity: 1 }])

        const { result } = await allocate(order.id)

        expect(result.failures).toEqual([
          expect.objectContaining({ requested: 1, available: 0 }),
        ])
      })

      it("never chooses an expired Voucher and takes the earliest valid-until first, never-expiring last", async () => {
        const product = await createVoucherProductVariant(getContainer())
        await stockVouchers(getContainer(), product, [
          { code: "NEVER-0001" },
          { code: "LATE-0002", valid_until: inDays(90) },
          { code: "SOON-0003", valid_until: inDays(10) },
          { code: "EXPIRED-0004", valid_from: inDays(-60), valid_until: inDays(-1) },
          { code: "MID-0005", valid_until: inDays(30) },
        ])
        const order = await createOrder(getContainer(), [{ variant_id: product.variantId, quantity: 3 }])

        const { result } = await allocate(order.id)

        const chosen = await service().listVouchers({
          id: result.allocated.map((a) => a.voucher_id),
        })
        const untilDays = chosen
          .map((v) => (v.valid_until ? Math.round((v.valid_until.getTime() - Date.now()) / DAY) : null))
          .sort((a, b) => (a ?? Infinity) - (b ?? Infinity))
        expect(untilDays).toEqual([10, 30, 90])
      })

      it("fails an order when only expired Vouchers remain", async () => {
        const product = await createVoucherProductVariant(getContainer())
        await stockVouchers(getContainer(), product, [
          { code: "OLD-0001", valid_from: inDays(-60), valid_until: inDays(-1) },
        ])
        const order = await createOrder(getContainer(), [{ variant_id: product.variantId, quantity: 1 }])

        const { result } = await allocate(order.id)

        expect(result.failures).toEqual([expect.objectContaining({ available: 0 })])
      })

      describe("minimum remaining validity (the host app sets 7 days)", () => {
        it("skips Vouchers with too little time left, counting a not-yet-started one from its start", async () => {
          const product = await createVoucherProductVariant(getContainer())
          await stockVouchers(getContainer(), product, [
            { code: "ENDING-0001", valid_until: inDays(5) },
            { code: "NEARLY-0002", valid_until: inDays(6.5) },
            { code: "STARTS-LATE-SHORT-0003", valid_from: inDays(30), valid_until: inDays(33) },
            { code: "STARTS-LATE-LONG-0004", valid_from: inDays(30), valid_until: inDays(40) },
            { code: "EXACT-0005", valid_until: inDays(8) },
          ])
          const order = await createOrder(getContainer(), [{ variant_id: product.variantId, quantity: 2 }])

          const { result } = await allocate(order.id)

          const chosen = await service().listVouchers({ id: result.allocated.map((a) => a.voucher_id) })
          const untilDays = chosen
            .map((v) => Math.round((v.valid_until!.getTime() - Date.now()) / DAY))
            .sort((a, b) => a - b)
          expect(result.failures).toEqual([])
          // 8 days left, and 10 days from the start (day 30) of the one that starts later
          expect(untilDays).toEqual([8, 40])
        })

        it("reports only the Vouchers that pass as available when the Pool is short", async () => {
          const product = await createVoucherProductVariant(getContainer())
          await stockVouchers(getContainer(), product, [
            { code: "ENDING-0001", valid_until: inDays(2) },
            { code: "FINE-0002", valid_until: inDays(20) },
          ])
          const order = await createOrder(getContainer(), [{ variant_id: product.variantId, quantity: 2 }])

          const { result } = await allocate(order.id)

          expect(result.failures).toEqual([expect.objectContaining({ requested: 2, available: 1 })])
        })
      })
    })
  },
})
