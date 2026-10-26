import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import jsQR from "jsqr"
import path from "path"
import { PNG } from "pngjs"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import { VoucherStatus } from "../../src/modules/voucher/constants"
import VoucherModuleService from "../../src/modules/voucher/service"
import { allocateVouchersForPaidOrderWorkflow } from "../../src/workflows/allocate-vouchers-for-paid-order"
import { createCustomerHeaders, createPublishableKey } from "../helpers/customer"
import {
  createOrder,
  createVoucherProductVariant,
  payOrderInFull,
  stockVouchers,
} from "../helpers/vouchers"

jest.setTimeout(60 * 1000)

// The text a `data:image/png;base64,...` QR code reads as.
const readQrCode = (dataUrl: string) => {
  const png = PNG.sync.read(Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"))

  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data
}

// Allocations here only give Vouchers an order. Read by the test application's configuration
// in the runner's beforeAll.
process.env.VOUCHER_TEST_DELIVERY_AUTOMATIC = "false"

medusaIntegrationTestRunner({
  medusaConfigFile: path.join(__dirname, ".."),
  testSuite: ({ api, getContainer }) => {
    describe("A customer's own Vouchers (store API)", () => {
      const service = (): VoucherModuleService => getContainer().resolve(VOUCHER_MODULE)
      const get = (url: string, headers?: object) => api.get(url, headers).catch((error) => error.response)

      afterAll(() => {
        delete process.env.VOUCHER_TEST_DELIVERY_AUTOMATIC
      })

      const paidOrder = async (variantId: string, quantity: number, customerId?: string) => {
        const order = await createOrder(
          getContainer(),
          [{ variant_id: variantId, quantity, requires_shipping: false }],
          { customer_id: customerId }
        )
        await payOrderInFull(getContainer(), order.id, quantity * 500)
        await allocateVouchersForPaidOrderWorkflow(getContainer()).run({ input: { order_id: order.id } })

        return order
      }

      // Somchai buys one Voucher, then two more (one of them is later voided); Malee buys one.
      const twoCustomers = async () => {
        const key = await createPublishableKey(getContainer())
        const somchai = await createCustomerHeaders(getContainer(), "somchai@example.test", key)
        const malee = await createCustomerHeaders(getContainer(), "malee@example.test", key)
        const product = await createVoucherProductVariant(getContainer(), "500")
        await stockVouchers(
          getContainer(),
          product,
          [
            { code: "CUST-0001-SECRET", pin: "1111", valid_from: new Date("2026-01-01T00:00:00+07:00"), valid_until: new Date("2027-01-01T00:00:00+07:00") },
            { code: "CUST-0002-SECRET", pin: "2222" },
            { code: "CUST-0003-SECRET" },
            { code: "CUST-0004-SECRET", pin: "4444" },
          ],
          { redemption_instructions: "Show the code at the counter." }
        )

        const first = await paidOrder(product.variantId, 1, somchai.customerId)
        const second = await paidOrder(product.variantId, 2, somchai.customerId)
        const maleeOrder = await paidOrder(product.variantId, 1, malee.customerId)
        const guestOrder = await createOrder(getContainer(), [
          { variant_id: product.variantId, quantity: 1, requires_shipping: false },
        ])

        const allocations = await service().listVoucherAllocations(
          { order_id: [first.id, second.id, maleeOrder.id] },
          { relations: ["voucher"] }
        )
        const voucherOf = (orderId: string) =>
          allocations.filter((a) => a.order_id === orderId).map((a) => a.voucher.id)

        return { key, somchai, malee, first, second, maleeOrder, guestOrder, voucherOf }
      }

      describe("GET /store/customers/me/vouchers", () => {
        it("lists the signed-in customer's Vouchers, newest order first, each code masked", async () => {
          const { somchai, first, second, voucherOf } = await twoCustomers()
          const [voided] = voucherOf(second.id)
          await service().updateVouchers({ id: voided, status: VoucherStatus.VOID })

          const response = await get("/store/customers/me/vouchers", somchai.headers)

          expect(response.status).toBe(200)
          expect(response.data.count).toBe(2)
          expect(response.data.vouchers.map((v: { order: { id: string } }) => v.order.id)).toEqual([
            second.id,
            first.id,
          ])
          expect(response.data.vouchers[1]).toEqual({
            id: voucherOf(first.id)[0],
            status: "allocated",
            code_hint: expect.any(String),
            order: { id: first.id, display_id: first.display_id },
            product: { title: "Example voucher 500" },
            variant: { title: "500" },
            face_value: 500,
            currency_code: "thb",
            first_day: "2026-01-01",
            last_day: "2026-12-31",
            redemption_instructions: "Show the code at the counter.",
          })
          expect(JSON.stringify(response.data)).not.toMatch(/SECRET|1111|2222|4444|code_encrypted|pin_encrypted|code_hash/)
        })

        it("filters by order and pages", async () => {
          const { somchai, first, second } = await twoCustomers()

          const byOrder = await get(`/store/customers/me/vouchers?order_id=${first.id}`, somchai.headers)
          const page = await get("/store/customers/me/vouchers?limit=1&offset=1", somchai.headers)

          expect(byOrder.data.vouchers.map((v: { order: { id: string } }) => v.order.id)).toEqual([first.id])
          expect(page.data).toEqual(
            expect.objectContaining({ count: 3, limit: 1, offset: 1 })
          )
          expect(page.data.vouchers.map((v: { order: { id: string } }) => v.order.id)).toEqual([second.id])
        })

        it("shows nothing of another customer's or a guest's orders", async () => {
          const { malee, maleeOrder } = await twoCustomers()

          const response = await get("/store/customers/me/vouchers", malee.headers)

          expect(response.data.vouchers.map((v: { order: { id: string } }) => v.order.id)).toEqual([
            maleeOrder.id,
          ])
        })

        it("refuses a request without a signed-in customer", async () => {
          const { key } = await twoCustomers()

          const response = await get("/store/customers/me/vouchers", {
            headers: { "x-publishable-api-key": key },
          })

          expect(response.status).toBe(401)
        })
      })

      describe("GET /store/customers/me/vouchers/:id", () => {
        it("gives the signed-in customer one of their Vouchers in full, with a QR code of the code alone", async () => {
          const { somchai, first, voucherOf } = await twoCustomers()
          const [id] = voucherOf(first.id)

          const response = await get(`/store/customers/me/vouchers/${id}`, somchai.headers)

          expect(response.status).toBe(200)
          expect(response.data.voucher).toEqual(
            expect.objectContaining({
              id,
              order: { id: first.id, display_id: first.display_id },
              code: "CUST-0001-SECRET",
              pin: "1111",
              qr_code: expect.stringMatching(/^data:image\/png;base64,/),
            })
          )
          expect(readQrCode(response.data.voucher.qr_code)).toBe("CUST-0001-SECRET")
        })

        it("refuses another customer's, a Void or an unknown Voucher with 404", async () => {
          const { somchai, malee, second, maleeOrder, voucherOf } = await twoCustomers()
          const [voided] = voucherOf(second.id)
          await service().updateVouchers({ id: voided, status: VoucherStatus.VOID })

          const others = await get(`/store/customers/me/vouchers/${voucherOf(maleeOrder.id)[0]}`, somchai.headers)
          const voidOne = await get(`/store/customers/me/vouchers/${voided}`, somchai.headers)
          const unknown = await get("/store/customers/me/vouchers/vch_unknown", malee.headers)

          expect([others.status, voidOne.status, unknown.status]).toEqual([404, 404, 404])
          expect(JSON.stringify([others.data, voidOne.data, unknown.data])).not.toMatch(/SECRET/)
        })
      })
    })
  },
})
