import path from "path"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { generateJwtToken, Modules } from "@medusajs/framework/utils"
import { VoucherStatus } from "../../src/modules/voucher/constants"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import VoucherModuleService from "../../src/modules/voucher/service"

jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  medusaConfigFile: path.join(__dirname, ".."),
  testSuite: ({ api, getContainer }) => {
    describe("@khumkha/medusa-voucher", () => {
      it("registers the voucher module in the host app", async () => {
        const service: VoucherModuleService =
          getContainer().resolve(VOUCHER_MODULE)

        const batch = await service.createVoucherBatches({
          partner: "Example Partner",
          variant_id: "variant_100",
          face_value: 100,
          currency_code: "thb",
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
        let headers: { headers: { authorization: string } }
        let variantId: string

        const body = (csv: string) => ({
          partner: "Example Partner",
          variant_id: variantId,
          face_value: 100,
          currency_code: "THB",
          purchased_at: "2026-10-01",
          csv,
        })

        beforeEach(async () => {
          const container = getContainer()
          const user = await container.resolve(Modules.USER).createUsers({
            email: "admin@example.test",
          })
          const identity = await container
            .resolve(Modules.AUTH)
            .createAuthIdentities({
              provider_identities: [
                { provider: "emailpass", entity_id: "admin@example.test" },
              ],
              app_metadata: { user_id: user.id },
            })
          const token = generateJwtToken(
            {
              actor_id: user.id,
              actor_type: "user",
              auth_identity_id: identity.id,
              app_metadata: { user_id: user.id },
            },
            { secret: "supersecret", expiresIn: "1d" }
          )
          headers = { headers: { authorization: `Bearer ${token}` } }

          const [product] = await container.resolve(Modules.PRODUCT).createProducts([
            {
              title: "Example voucher",
              options: [{ title: "Face value", values: ["100"] }],
              variants: [{ title: "100", options: { "Face value": "100" } }],
            },
          ])
          variantId = product.variants[0].id
        })

        it("imports a CSV as a batch without returning any code", async () => {
          const response = await api.post(
            "/admin/voucher-batches/import",
            body("code,pin,valid_until\nCSV-CODE-0001,1234,31-12-2026\nCSV-CODE-0002,,"),
            headers
          )

          expect(response.status).toBe(201)
          expect(response.data.imported).toBe(2)
          expect(response.data.voucher_batch).toEqual(
            expect.objectContaining({ partner: "Example Partner", currency_code: "thb" })
          )
          expect(JSON.stringify(response.data)).not.toMatch(/CSV-CODE|1234/)

          const service: VoucherModuleService = getContainer().resolve(VOUCHER_MODULE)
          const vouchers = await service.listVouchers({
            batch_id: response.data.voucher_batch.id,
          })
          expect(vouchers).toHaveLength(2)
        })

        it("rejects a CSV with a problem, listing its line, and creates no batch", async () => {
          const response = await api
            .post(
              "/admin/voucher-batches/import",
              body("code,valid_from\nCSV-CODE-0003,\nCSV-CODE-0004,not-a-date"),
              headers
            )
            .catch((error) => error.response)

          expect(response.status).toBe(400)
          expect(response.data.message).toMatch(/line 3/)
          expect(response.data.message).not.toMatch(/CSV-CODE/)

          const service: VoucherModuleService = getContainer().resolve(VOUCHER_MODULE)
          expect(await service.listVoucherBatches()).toHaveLength(0)
        })

        it("rolls the batch back when a code is already stored", async () => {
          await api.post("/admin/voucher-batches/import", body("code\nCSV-CODE-0005"), headers)

          const response = await api
            .post(
              "/admin/voucher-batches/import",
              body("code\nCSV-CODE-0006\nCSV-CODE-0005"),
              headers
            )
            .catch((error) => error.response)

          expect(response.status).toBe(400)
          expect(response.data.message).toMatch(/lines: 3/)

          const service: VoucherModuleService = getContainer().resolve(VOUCHER_MODULE)
          expect(await service.listVoucherBatches()).toHaveLength(1)
        })

        it("rejects an unknown variant and an unauthenticated request", async () => {
          const unknown = await api
            .post(
              "/admin/voucher-batches/import",
              { ...body("code\nCSV-CODE-0007"), variant_id: "variant_missing" },
              headers
            )
            .catch((error) => error.response)
          expect(unknown.status).toBe(404)

          const anonymous = await api
            .post("/admin/voucher-batches/import", body("code\nCSV-CODE-0008"))
            .catch((error) => error.response)
          expect(anonymous.status).toBe(401)
        })
      })
    })
  },
})
