import { Spinner } from "@medusajs/icons"
import { FetchError } from "@medusajs/js-sdk"
import {
  Container,
  createDataTableColumnHelper,
  DataTable,
  DataTablePaginationState,
  Heading,
  Select,
  StatusBadge,
  Text,
  useDataTable,
} from "@medusajs/ui"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useParams } from "react-router-dom"
import { formatDate, formatDay, usePaginationTranslations } from "../../../lib/locale"
import {
  formatMoney,
  listPoolVouchers,
  listVoucherBatches,
  POOL_STATUSES,
  PoolCounts,
  PoolStatus,
  PoolVoucher,
  retrieveVoucherProduct,
  statusColor,
  VOUCHER_NS,
  VoucherBatch,
  VoucherProduct,
} from "../../../lib/vouchers"

const PAGE_SIZE = 20
// The batch filter offers the newest batches, as many as one request returns.
const BATCH_FILTER_SIZE = 100
const ALL = "all"

const isNotFound = (error: unknown) => error instanceof FetchError && error.status === 404

const batchColumns = createDataTableColumnHelper<VoucherBatch>()
const voucherColumns = createDataTableColumnHelper<PoolVoucher>()

const usePage = () =>
  useState<DataTablePaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE })

const PoolSection = ({ counts }: { counts: PoolCounts }) => {
  const { t } = useTranslation(VOUCHER_NS)

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("detail.pool")}</Heading>
      </div>
      <div className="grid grid-cols-2 gap-4 px-6 py-4 md:grid-cols-6">
        {POOL_STATUSES.map((status) => (
          <div key={status} className="flex flex-col gap-y-1">
            <StatusBadge color={statusColor[status]} className="w-fit">
              {t(`status.${status}`)}
            </StatusBadge>
            <Text size="xlarge" weight="plus">
              {counts[status]}
            </Text>
          </div>
        ))}
      </div>
    </Container>
  )
}

const BatchesSection = ({ voucherProduct }: { voucherProduct: VoucherProduct }) => {
  const { t, i18n } = useTranslation(VOUCHER_NS)
  const [pagination, setPagination] = usePage()
  const paginationTranslations = usePaginationTranslations()
  const limit = pagination.pageSize
  const offset = pagination.pageIndex * limit

  const { data, isLoading } = useQuery({
    queryKey: ["voucher-batches", voucherProduct.id, limit, offset],
    queryFn: () => listVoucherBatches(voucherProduct.id, { limit, offset }),
    placeholderData: keepPreviousData,
  })

  const columns = useMemo(
    () => [
      batchColumns.accessor("purchased_at", {
        header: t("detail.purchasedAt"),
        cell: ({ getValue }) => formatDate(getValue(), i18n.language),
      }),
      batchColumns.accessor("reference", {
        header: t("detail.reference"),
        cell: ({ getValue }) => getValue() ?? "-",
      }),
      batchColumns.accessor("unit_cost", {
        header: t("detail.unitCost"),
        cell: ({ getValue }) => {
          const unitCost = getValue()

          return unitCost === null
            ? "-"
            : formatMoney(unitCost, voucherProduct.currency_code, i18n.language)
        },
      }),
      ...POOL_STATUSES.map((status) =>
        batchColumns.display({
          id: status,
          header: t(`status.${status}`),
          cell: ({ row }) => row.original.counts[status],
        })
      ),
    ],
    [t, i18n.language, voucherProduct.currency_code]
  )

  const table = useDataTable({
    data: data?.batches ?? [],
    columns,
    getRowId: (batch) => batch.id,
    rowCount: data?.count ?? 0,
    isLoading,
    pagination: { state: pagination, onPaginationChange: setPagination },
  })

  return (
    <Container className="divide-y p-0">
      <DataTable instance={table}>
        <DataTable.Toolbar className="px-6 py-4">
          <Heading level="h2">{t("detail.batches")}</Heading>
        </DataTable.Toolbar>
        <DataTable.Table emptyState={{ empty: { heading: t("detail.noBatches") } }} />
        <DataTable.Pagination translations={paginationTranslations} />
      </DataTable>
    </Container>
  )
}

const VouchersSection = ({ voucherProduct }: { voucherProduct: VoucherProduct }) => {
  const { t, i18n } = useTranslation(VOUCHER_NS)
  const [pagination, setPagination] = usePage()
  const paginationTranslations = usePaginationTranslations()
  const [status, setStatus] = useState<PoolStatus | undefined>()
  const [batchId, setBatchId] = useState<string | undefined>()
  const limit = pagination.pageSize
  const offset = pagination.pageIndex * limit

  const { data, isLoading } = useQuery({
    queryKey: ["pool-vouchers", voucherProduct.id, status, batchId, limit, offset],
    queryFn: () =>
      listPoolVouchers(voucherProduct.id, { limit, offset, status, batch_id: batchId }),
    placeholderData: keepPreviousData,
  })
  const { data: batchOptions } = useQuery({
    queryKey: ["voucher-batch-options", voucherProduct.id],
    queryFn: () => listVoucherBatches(voucherProduct.id, { limit: BATCH_FILTER_SIZE, offset: 0 }),
  })

  // A new filter starts again from the first page.
  const filter = <T,>(set: (value: T) => void) => (value: T) => {
    set(value)
    setPagination((page) => ({ ...page, pageIndex: 0 }))
  }

  const columns = useMemo(
    () => [
      voucherColumns.accessor("code_hint", {
        header: t("detail.code"),
        // Only the code's last characters are ever sent; the rest is masked.
        cell: ({ getValue }) => <span className="font-mono">{`•••• ${getValue()}`}</span>,
      }),
      voucherColumns.accessor("status", {
        header: t("detail.status"),
        cell: ({ getValue }) => (
          <StatusBadge color={statusColor[getValue()]}>{t(`status.${getValue()}`)}</StatusBadge>
        ),
      }),
      voucherColumns.accessor("batch", {
        header: t("detail.batch"),
        cell: ({ getValue }) => getValue().reference ?? "-",
      }),
      voucherColumns.accessor("first_day", {
        header: t("detail.firstDay"),
        cell: ({ getValue }) => {
          const day = getValue()

          return day ? formatDay(day, i18n.language) : t("detail.open")
        },
      }),
      voucherColumns.accessor("last_day", {
        header: t("detail.lastDay"),
        cell: ({ getValue }) => {
          const day = getValue()

          return day ? formatDay(day, i18n.language) : t("detail.open")
        },
      }),
      voucherColumns.accessor("order", {
        header: t("detail.order"),
        cell: ({ getValue }) => {
          const order = getValue()

          return order ? (
            <Link to={`/orders/${order.id}`} className="text-ui-fg-interactive hover:underline">
              #{order.display_id}
            </Link>
          ) : (
            "-"
          )
        },
      }),
    ],
    [t, i18n.language]
  )

  const table = useDataTable({
    data: data?.vouchers ?? [],
    columns,
    getRowId: (voucher) => voucher.id,
    rowCount: data?.count ?? 0,
    isLoading,
    pagination: { state: pagination, onPaginationChange: setPagination },
  })

  return (
    <Container className="divide-y p-0">
      <DataTable instance={table}>
        <DataTable.Toolbar className="flex flex-col items-start justify-between gap-2 px-6 py-4 md:flex-row md:items-center">
          <Heading level="h2">{t("detail.vouchers")}</Heading>
          <div className="flex gap-2">
            <Select
              size="small"
              value={status ?? ALL}
              onValueChange={filter((value: string) =>
                setStatus(value === ALL ? undefined : (value as PoolStatus))
              )}
            >
              <Select.Trigger className="whitespace-nowrap">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={ALL}>{t("detail.allStatuses")}</Select.Item>
                {POOL_STATUSES.map((poolStatus) => (
                  <Select.Item key={poolStatus} value={poolStatus}>
                    {t(`status.${poolStatus}`)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
            <Select
              size="small"
              value={batchId ?? ALL}
              onValueChange={filter((value: string) => setBatchId(value === ALL ? undefined : value))}
            >
              <Select.Trigger className="whitespace-nowrap">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={ALL}>{t("detail.allBatches")}</Select.Item>
                {batchOptions?.batches.map((batch) => (
                  <Select.Item key={batch.id} value={batch.id}>
                    {batch.reference ?? formatDate(batch.purchased_at, i18n.language)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        </DataTable.Toolbar>
        <DataTable.Table
          emptyState={{
            empty: { heading: t("detail.noVouchers") },
            filtered: { heading: t("detail.noVouchers") },
          }}
        />
        <DataTable.Pagination translations={paginationTranslations} />
      </DataTable>
    </Container>
  )
}

const VoucherProductPage = () => {
  const { t, i18n } = useTranslation(VOUCHER_NS)
  const { id } = useParams()

  const { data, isLoading, error } = useQuery({
    queryKey: ["voucher-product", id],
    queryFn: () => retrieveVoucherProduct(id!),
    // A missing Voucher product stays missing; other failures are retried as usual.
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 3,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner />
      </div>
    )
  }

  if (error || !data) {
    return (
      <Container className="px-6 py-4">
        <Text size="small" className="text-ui-fg-subtle">
          {t(isNotFound(error) ? "detail.notFound" : "detail.loadFailed")}
        </Text>
      </Container>
    )
  }

  const voucherProduct = data.voucher_product

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="flex flex-col gap-y-1 px-6 py-4">
        <Link to="/vouchers" className="text-ui-fg-subtle txt-compact-small hover:text-ui-fg-base">
          {t("list.title")}
        </Link>
        <Heading>
          {voucherProduct.product_variant.product.title} · {voucherProduct.product_variant.title}
        </Heading>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {t("list.faceValue")}:{" "}
          {formatMoney(voucherProduct.face_value, voucherProduct.currency_code, i18n.language)}
        </Text>
      </Container>
      <PoolSection counts={voucherProduct.counts} />
      <BatchesSection voucherProduct={voucherProduct} />
      <VouchersSection voucherProduct={voucherProduct} />
    </div>
  )
}

export default VoucherProductPage
