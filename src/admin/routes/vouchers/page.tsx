import { defineRouteConfig } from "@medusajs/admin-sdk"
import { DataTable } from "@medusajs/dashboard/components"
import { useQueryParams } from "@medusajs/dashboard/hooks"
import { getLocaleAmount } from "@medusajs/dashboard/lib"
import { ReceiptPercent } from "@medusajs/icons"
import { Container, createDataTableColumnHelper } from "@medusajs/ui"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { listVoucherProducts, VOUCHER_NS, VoucherProduct } from "../../lib/vouchers"

const PAGE_SIZE = 20

const columnHelper = createDataTableColumnHelper<VoucherProduct>()

const VouchersPage = () => {
  const { t, i18n } = useTranslation(VOUCHER_NS)
  const { offset } = useQueryParams(["offset"])

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["voucher-products", offset],
    queryFn: () => listVoucherProducts({ limit: PAGE_SIZE, offset: offset ? parseInt(offset) : 0 }),
    placeholderData: keepPreviousData,
  })

  const columns = useMemo(() => {
    const count = (status: "available" | "expired" | "under_minimum" | "allocated" | "delivered") =>
      columnHelper.display({
        id: status,
        header: t(`status.${status}`),
        cell: ({ row }) => row.original.counts[status].toLocaleString(i18n.language),
      })

    return [
      columnHelper.accessor("product_variant.product.title", { header: t("list.partner") }),
      columnHelper.accessor("product_variant.title", { header: t("list.variant") }),
      columnHelper.accessor("face_value", {
        header: t("list.faceValue"),
        cell: ({ row }) => getLocaleAmount(row.original.face_value, row.original.currency_code),
      }),
      count("available"),
      count("expired"),
      count("under_minimum"),
      count("allocated"),
      count("delivered"),
      columnHelper.accessor("open_allocation_failures", {
        header: t("listColumns.openAllocationFailures"),
        cell: ({ row }) => row.original.open_allocation_failures.toLocaleString(i18n.language),
      }),
    ]
  }, [t, i18n.language])

  if (isError) {
    throw error
  }

  return (
    <Container className="divide-y p-0">
      <DataTable
        data={data?.voucher_products}
        columns={columns}
        rowCount={data?.count}
        getRowId={(voucherProduct) => voucherProduct.id}
        rowHref={(voucherProduct) => `/vouchers/${voucherProduct.id}`}
        pageSize={PAGE_SIZE}
        enableSearch={false}
        isLoading={isPending}
        heading={t("list.title")}
        subHeading={t("list.description")}
        emptyState={{ empty: { heading: t("list.empty") } }}
      />
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "menu.vouchers",
  // A string literal: the admin build reads it from the source, not by running it.
  translationNs: "medusa-voucher",
  icon: ReceiptPercent,
})

const VouchersBreadcrumb = () => {
  const { t } = useTranslation(VOUCHER_NS)

  return <span>{t("list.title")}</span>
}

export const handle = {
  breadcrumb: () => <VouchersBreadcrumb />,
}

export default VouchersPage
