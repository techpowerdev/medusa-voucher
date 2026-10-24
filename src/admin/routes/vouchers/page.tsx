import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ReceiptPercent } from "@medusajs/icons"
import {
  Container,
  createDataTableColumnHelper,
  DataTable,
  DataTablePaginationState,
  Heading,
  Text,
  useDataTable,
} from "@medusajs/ui"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { usePaginationTranslations } from "../../lib/locale"
import { formatMoney, listVoucherProducts, VOUCHER_NS, VoucherProduct } from "../../lib/vouchers"

const PAGE_SIZE = 20

const columnHelper = createDataTableColumnHelper<VoucherProduct>()

const VouchersPage = () => {
  const { t, i18n } = useTranslation(VOUCHER_NS)
  const navigate = useNavigate()
  const paginationTranslations = usePaginationTranslations()
  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  })
  const limit = pagination.pageSize
  const offset = pagination.pageIndex * limit

  const { data, isLoading } = useQuery({
    queryKey: ["voucher-products", limit, offset],
    queryFn: () => listVoucherProducts({ limit, offset }),
    placeholderData: keepPreviousData,
  })

  const columns = useMemo(() => {
    const count = (status: "available" | "expired" | "under_minimum" | "allocated" | "delivered") =>
      columnHelper.display({
        id: status,
        header: t(`status.${status}`),
        cell: ({ row }) => row.original.counts[status],
      })

    return [
      columnHelper.accessor("product_variant.product.title", { header: t("list.partner") }),
      columnHelper.accessor("product_variant.title", { header: t("list.variant") }),
      columnHelper.accessor("face_value", {
        header: t("list.faceValue"),
        cell: ({ row }) =>
          formatMoney(row.original.face_value, row.original.currency_code, i18n.language),
      }),
      count("available"),
      count("expired"),
      count("under_minimum"),
      count("allocated"),
      count("delivered"),
    ]
  }, [t, i18n.language])

  const table = useDataTable({
    data: data?.voucher_products ?? [],
    columns,
    getRowId: (voucherProduct) => voucherProduct.id,
    rowCount: data?.count ?? 0,
    isLoading,
    pagination: { state: pagination, onPaginationChange: setPagination },
    onRowClick: (_, voucherProduct) => navigate(`/vouchers/${voucherProduct.id}`),
  })

  return (
    <Container className="divide-y p-0">
      <DataTable instance={table}>
        <DataTable.Toolbar className="flex flex-col items-start gap-1 px-6 py-4">
          <Heading>{t("list.title")}</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {t("list.description")}
          </Text>
        </DataTable.Toolbar>
        <DataTable.Table emptyState={{ empty: { heading: t("list.empty") } }} />
        <DataTable.Pagination translations={paginationTranslations} />
      </DataTable>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "menu.vouchers",
  // A string literal: the admin build reads it from the source, not by running it.
  translationNs: "medusa-voucher",
  icon: ReceiptPercent,
})

export default VouchersPage
