import path from "path"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { VoucherStatus } from "../../src/modules/voucher/constants"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import VoucherModuleService from "../../src/modules/voucher/service"
import { createAdminHeaders, createVariant } from "../helpers/admin"

jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  medusaConfigFile: path.join(__dirname, ".."),
  testSuite: ({ api, getContainer }) => {
    describe("@khumkha/medusa-voucher", () => {
      it("registers the voucher module in the host app", async () => {
        const service: VoucherModuleService =
          getContainer().resolve(VOUCHER_MODULE)

        const voucherProduct = await service.createVoucherProducts({
          face_value: 100,
          currency_code: "thb",
        })
        const batch = await service.createVoucherBatches({
          voucher_product_id: voucherProduct.id,
          variant_id: "variant_100",
          purchased_at: new Date(),
        })

        const [voucher] = await service.createVouchersFromCodes({
          batch_id: batch.id,
          vouchers: [{ code: "HOST-APP-CODE-0001", pin: "1234" }],
        })

        expect(voucher.status).toBe(VoucherStatus.AVAILABLE)
        expect(voucher.code_encrypted).not.toContain("HOST-APP")
        expect(await service.revealVoucher(voucher.id)).toEqual({
          code: "HOST-APP-CODE-0001",
          pin: "1234",
        })
      })

      describe("POST /admin/voucher-batches/import", () => {
        let headers: Awaited<ReturnType<typeof createAdminHeaders>>
        let variantId: string
        let voucherProductId: string

        const body = (csv: string, extra: Record<string, unknown> = {}) => ({
          voucher_product_id: voucherProductId,
          purchased_at: "2026-10-01",
          unit_cost: 92,
          reference: "PO-1",
          csv,
          ...extra,
        })

        const importCsv = (csv: string, extra: Record<string, unknown> = {}) =>
          api
            .post("/admin/voucher-batches/import", body(csv, extra), headers)
            .catch((error) => error.response)

        const service = (): VoucherModuleService =>
          getContainer().resolve(VOUCHER_MODULE)

        beforeEach(async () => {
          headers = await createAdminHeaders(getContainer())
          variantId = await createVariant(getContainer())

          const created = await api.post(
            "/admin/voucher-products",
            { variant_id: variantId, face_value: 100, currency_code: "THB" },
            headers
          )
          voucherProductId = created.data.voucher_product.id
        })

        it("imports a CSV against a Voucher product without returning any code", async () => {
          const response = await importCsv(
            "code,pin,valid_until\nCSV-CODE-0001,1234,31-12-2026\nCSV-CODE-0002,,"
          )

          expect(response.status).toBe(201)
          expect(response.data.imported).toBe(2)
          expect(response.data.voucher_batch).toEqual(
            expect.objectContaining({
              voucher_product_id: voucherProductId,
              reference: "PO-1",
            })
          )
          expect(response.data.voucher_batch).not.toHaveProperty("partner")
          expect(response.data.voucher_batch).not.toHaveProperty("face_value")
          expect(JSON.stringify(response.data)).not.toMatch(/CSV-CODE|1234/)

          const vouchers = await service().listVouchers({
            batch_id: response.data.voucher_batch.id,
          })
          expect(vouchers).toHaveLength(2)
          expect(vouchers.every((v) => v.variant_id === variantId)).toBe(true)
        })

        it("rejects a CSV with a problem, listing its line, and creates no batch", async () => {
          const response = await importCsv(
            "code,valid_from\nCSV-CODE-0003,\nCSV-CODE-0004,not-a-date"
          )

          expect(response.status).toBe(400)
          expect(response.data.message).toMatch(/line 3/)
          expect(response.data.message).not.toMatch(/CSV-CODE/)
          expect(await service().listVoucherBatches()).toHaveLength(0)
        })

        it("rolls the batch back when a code is already stored", async () => {
          await importCsv("code\nCSV-CODE-0005")

          const response = await importCsv("code\nCSV-CODE-0006\nCSV-CODE-0005")

          expect(response.status).toBe(400)
          expect(response.data.message).toMatch(/lines: 3/)
          expect(await service().listVoucherBatches()).toHaveLength(1)
        })

        it("rejects an unknown Voucher product without creating anything", async () => {
          const response = await importCsv("code\nCSV-CODE-0007", {
            voucher_product_id: "vprod_missing",
          })

          expect(response.status).toBe(404)
          expect(await service().listVoucherBatches()).toHaveLength(0)
        })

        it("rejects a Voucher product whose variant was deleted, creating nothing", async () => {
          await getContainer()
            .resolve(Modules.PRODUCT)
            .softDeleteProductVariants([variantId])

          const response = await importCsv("code\nCSV-CODE-0010")

          expect(response.status).toBe(400)
          expect(response.data.message).toMatch(/has no product variant/)
          expect(await service().listVoucherBatches()).toHaveLength(0)
        })

        it("rejects the old request shape that named a variant and a Partner", async () => {
          const response = await importCsv("code\nCSV-CODE-0009", {
            voucher_product_id: undefined,
            variant_id: variantId,
            partner: "Example Partner",
          })

          expect(response.status).toBe(400)
        })

        it("rejects an unauthenticated request", async () => {
          const anonymous = await api
            .post("/admin/voucher-batches/import", body("code\nCSV-CODE-0008"))
            .catch((error) => error.response)

          expect(anonymous.status).toBe(401)
        })
      })
    })
  },
})
