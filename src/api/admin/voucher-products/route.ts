import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { VOUCHER_MODULE } from "../../../modules/voucher"
import VoucherModuleService from "../../../modules/voucher/service"
import { emptyPoolCounts } from "../../../modules/voucher/types"
import { createVoucherProductWorkflow } from "../../../workflows/create-voucher-product"
import { CreateVoucherProductBody } from "./middlewares"

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const service: VoucherModuleService = req.scope.resolve(VOUCHER_MODULE)
  // Ordered by Partner (the Medusa product's title), then variant. Query cannot order by a
  // linked module's field, so every Voucher product is read and the page is cut here; a store
  // has tens of them, not thousands.
  const { data: all } = await query.graph({
    entity: "voucher_product",
    fields: [
      "id",
      "face_value",
      "currency_code",
      "product_variant.id",
      "product_variant.title",
      "product_variant.product.id",
      "product_variant.product.title",
    ],
  })
  const byName = (voucherProduct: (typeof all)[number]) => [
    voucherProduct.product_variant?.product?.title ?? "",
    voucherProduct.product_variant?.title ?? "",
  ]
  const { skip = 0, take } = req.queryConfig.pagination
  const data = [...all]
    .sort((a, b) => {
      const [aProduct, aVariant] = byName(a)
      const [bProduct, bVariant] = byName(b)

      return aProduct.localeCompare(bProduct) || aVariant.localeCompare(bVariant) || a.id.localeCompare(b.id)
    })
    .slice(skip, take === undefined ? undefined : skip + take)

  // `available_vouchers` is the Available count (Vouchers that can still be sold); `counts`
  // has the rest of the Pool, read in one query for the page. `open_allocation_failures` is
  // the number of orders waiting for Vouchers, also read in one query for the page.
  const variantIds = data
    .map((voucherProduct) => voucherProduct.product_variant?.id)
    .filter((id): id is string => !!id)
  const counts = await service.countPool("variant", variantIds)
  const waiting = await service.countOpenAllocationFailures(variantIds)
  const voucherProducts = data.map((voucherProduct) => {
    const variantId = voucherProduct.product_variant?.id ?? ""
    const pool = counts.get(variantId) ?? emptyPoolCounts()

    return {
      ...voucherProduct,
      available_vouchers: pool.available,
      counts: pool,
      open_allocation_failures: waiting.get(variantId) ?? 0,
    }
  })

  res.json({
    voucher_products: voucherProducts,
    count: all.length,
    limit: take,
    offset: skip,
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<CreateVoucherProductBody>,
  res: MedusaResponse
) => {
  const { result } = await createVoucherProductWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  res.status(201).json({ voucher_product: result })
}
