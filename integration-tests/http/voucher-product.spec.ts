import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import path from "path"
import { createAdminHeaders, createVariant } from "../helpers/admin"

jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  medusaConfigFile: path.join(__dirname, ".."),
  testSuite: ({ api, getContainer }) => {
    describe("Voucher products (admin API)", () => {
      let headers: Awaited<ReturnType<typeof createAdminHeaders>>
      let variantId: string

      beforeEach(async () => {
        headers = await createAdminHeaders(getContainer())
        variantId = await createVariant(getContainer())
      })

      it("marks a variant as a Voucher product that Medusa can query with its variant", async () => {
        const response = await api.post(
          "/admin/voucher-products",
          { variant_id: variantId, face_value: 100, currency_code: "THB" },
          headers
        )

        expect(response.status).toBe(201)
        expect(response.data.voucher_product).toEqual(
          expect.objectContaining({ face_value: 100, currency_code: "thb" })
        )

        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "voucher_product",
          fields: ["id", "product_variant.id"],
          filters: { id: response.data.voucher_product.id },
        })

        expect(data[0].product_variant.id).toBe(variantId)
      })

      const create = (body: Record<string, unknown>) =>
        api
          .post(
            "/admin/voucher-products",
            { face_value: 100, currency_code: "THB", ...body },
            headers
          )
          .catch((error) => error.response)

      it("refuses a variant that does not exist", async () => {
        const response = await create({ variant_id: "variant_missing" })

        expect(response.status).toBe(404)
      })

      it("refuses a variant that is already a Voucher product and creates nothing", async () => {
        await create({ variant_id: variantId })
        const response = await create({ variant_id: variantId, face_value: 500 })

        expect(response.status).toBe(422)
        expect(response.data.message).toMatch(/already a Voucher product/)

        const list = await api.get("/admin/voucher-products", headers)
        expect(list.data.voucher_products).toHaveLength(1)
      })

      // Vouchers are put in through the import API against the Voucher product.
      const addVouchers = async (voucherProductId: string, codes: string[]) =>
        api.post(
          "/admin/voucher-batches/import",
          {
            voucher_product_id: voucherProductId,
            purchased_at: "2026-10-01",
            csv: ["code", ...codes].join("\n"),
          },
          headers
        )

      it("lists Voucher products with their variant and how many Vouchers are Available", async () => {
        const empty = await create({ variant_id: variantId })
        expect(empty.status).toBe(201)

        const otherVariantId = await createVariant(getContainer(), "500")
        const other = await create({ variant_id: otherVariantId, face_value: 500 })
        await addVouchers(other.data.voucher_product.id, ["LIST-CODE-0001", "LIST-CODE-0002"])

        const response = await api.get("/admin/voucher-products", headers)
        const byId = Object.fromEntries(
          response.data.voucher_products.map((p: { id: string }) => [p.id, p])
        )

        expect(response.data.count).toBe(2)
        expect(byId[empty.data.voucher_product.id]).toEqual(
          expect.objectContaining({
            available_vouchers: 0,
            product_variant: expect.objectContaining({ id: variantId }),
          })
        )
        expect(byId[other.data.voucher_product.id].available_vouchers).toBe(2)
        expect(JSON.stringify(response.data)).not.toMatch(/LIST-CODE|code_hash|code_encrypted/)
      })

      describe("changing a Voucher product", () => {
        const update = (id: string, body: Record<string, unknown>) =>
          api
            .post(`/admin/voucher-products/${id}`, body, headers)
            .catch((error) => error.response)

        it("changes the Face value and currency while it has no Vouchers", async () => {
          const created = await create({ variant_id: variantId })

          const response = await update(created.data.voucher_product.id, {
            face_value: 500,
            currency_code: "USD",
          })

          expect(response.status).toBe(200)
          expect(response.data.voucher_product).toEqual(
            expect.objectContaining({ face_value: 500, currency_code: "usd" })
          )
        })

        it("refuses the change once the product has Vouchers, leaving it as it was", async () => {
          const created = await create({ variant_id: variantId })
          await addVouchers(created.data.voucher_product.id, ["CHANGE-CODE-0001"])

          const response = await update(created.data.voucher_product.id, { face_value: 500 })

          expect(response.status).toBe(400)
          expect(response.data.message).toMatch(/has Vouchers/)

          const list = await api.get("/admin/voucher-products", headers)
          expect(list.data.voucher_products[0].face_value).toBe(100)
        })

        it("refuses an unknown Voucher product", async () => {
          const response = await update("vprod_missing", { face_value: 500 })

          expect(response.status).toBe(404)
        })
      })
    })
  },
})
