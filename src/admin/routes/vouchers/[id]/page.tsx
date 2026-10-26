import { DataTable } from "@medusajs/dashboard/components"
import { useDate, useQueryParams } from "@medusajs/dashboard/hooks"
import { getLocaleAmount } from "@medusajs/dashboard/lib"
import {
  Container,
  createDataTableColumnHelper,
  createDataTableFilterHelper,
  Heading,
  StatusBadge,
  Text,
} from "@medusajs/ui"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link, Outlet, UIMatch, useParams } from "react-router-dom"
import {
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
// Each table keeps its page and filters in the URL under its own prefix.
const BATCHES_PREFIX = "b"
const VOUCHERS_PREFIX = "v"

const batchColumns = createDataTableColumnHelper<VoucherBatch>()
const voucherColumns = createDataTableColumnHelper<PoolVoucher>()
const voucherFilters = createDataTableFilterHelper<{ status: PoolStatus; batch_id: string }>()

const useVoucherProduct = (id: string) =>
  useQuery({
    queryKey: ["voucher-product", id],
    queryFn: () => retrieveVoucherProduct(id),
  })

// A calendar day such as "2026-12-31", read as that day where the admin is, so it is shown
// as the same day.
const localDay = (day: string) => `${day}T00:00:00`

// The table stores each filter's value as JSON, and `null` while a filter has no value yet.
const filterValue = <T,>(param: string | undefined): T | undefined =>
  (param ? JSON.parse(param) : null) ?? undefined

const PoolSection = ({ counts }: { counts: PoolCounts }) => {
  const { t, i18n } = useTranslation(VOUCHER_NS)

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
              {counts[status].toLocaleString(i18n.language)}
            </Text>
          </div>
        ))}
      </div>
    </Container>
  )
}

const BatchesSection = ({ voucherProduct }: { voucherProduct: VoucherProduct }) => {
  const { t, i18n } = useTranslation(VOUCHER_NS)
  const { getFullDate } = useDate()
  const { offset } = useQueryParams(["offset"], BATCHES_PREFIX)

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["voucher-batches", voucherProduct.id, offset],
    queryFn: () =>
      listVoucherBatches(voucherProduct.id, {
        limit: PAGE_SIZE,
        offset: offset ? parseInt(offset) : 0,
      }),
    placeholderData: keepPreviousData,
  })

  const columns = useMemo(
    () => [
      batchColumns.accessor("purchased_day", {
        header: t("detail.purchasedAt"),
        cell: ({ getValue }) => getFullDate({ date: localDay(getValue()) }),
      }),
      batchColumns.accessor("reference", {
        header: t("detail.reference"),
        cell: ({ getValue }) => getValue() ?? "-",
      }),
      batchColumns.accessor("unit_cost", {
        header: t("detail.unitCost"),
        cell: ({ getValue }) => {
          const unitCost = getValue()

          return unitCost === null ? "-" : getLocaleAmount(unitCost, voucherProduct.currency_code)
        },
      }),
      ...POOL_STATUSES.map((status) =>
        batchColumns.display({
          id: status,
          header: t(`status.${status}`),
          cell: ({ row }) => row.original.counts[status].toLocaleString(i18n.language),
        })
      ),
    ],
    [t, i18n.language, getFullDate, voucherProduct.currency_code]
  )

  if (isError) {
    throw error
  }

  return (
    <Container className="divide-y p-0">
      <DataTable
        data={data?.batches}
        columns={columns}
        rowCount={data?.count}
        getRowId={(batch) => batch.id}
        pageSize={PAGE_SIZE}
        enableSearch={false}
        prefix={BATCHES_PREFIX}
        isLoading={isPending}
        heading={t("detail.batches")}
        headingLevel="h2"
        action={{ label: t("import.action"), to: "import" }}
        emptyState={{ empty: { heading: t("detail.noBatches") } }}
      />
    </Container>
  )
}

const VouchersSection = ({ voucherProduct }: { voucherProduct: VoucherProduct }) => {
  const { t } = useTranslation(VOUCHER_NS)
  const { getFullDate } = useDate()
  const { offset, status, batch_id } = useQueryParams(
    ["offset", "status", "batch_id"],
    VOUCHERS_PREFIX
  )

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["pool-vouchers", voucherProduct.id, offset, status, batch_id],
    queryFn: () =>
      listPoolVouchers(voucherProduct.id, {
        limit: PAGE_SIZE,
        offset: offset ? parseInt(offset) : 0,
        status: filterValue(status),
        batch_id: filterValue(batch_id),
      }),
    placeholderData: keepPreviousData,
  })
  // A batch is named by its reference, or by its purchase day when it has none.
  const batchLabel = useCallback(
    (batch: { reference: string | null; purchased_day: string }) =>
      batch.reference ?? getFullDate({ date: localDay(batch.purchased_day) }),
    [getFullDate]
  )
  const { data: batchOptions } = useQuery({
    queryKey: ["voucher-batch-options", voucherProduct.id],
    queryFn: () => listVoucherBatches(voucherProduct.id, { limit: BATCH_FILTER_SIZE, offset: 0 }),
  })

  const filters = useMemo(
    () => [
      voucherFilters.accessor("status", {
        type: "radio",
        label: t("detail.status"),
        options: POOL_STATUSES.map((poolStatus) => ({
          label: t(`status.${poolStatus}`),
          value: poolStatus,
        })),
      }),
      voucherFilters.accessor("batch_id", {
        type: "radio",
        label: t("detail.batch"),
        options: (batchOptions?.batches ?? []).map((batch) => ({
          label: batchLabel(batch),
          value: batch.id,
        })),
      }),
    ],
    [t, batchLabel, batchOptions]
  )

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
        cell: ({ getValue }) => batchLabel(getValue()),
      }),
      voucherColumns.accessor("first_day", {
        header: t("detail.firstDay"),
        cell: ({ getValue }) => {
          const day = getValue()

          return day ? getFullDate({ date: localDay(day) }) : t("detail.open")
        },
      }),
      voucherColumns.accessor("last_day", {
        header: t("detail.lastDay"),
        cell: ({ getValue }) => {
          const day = getValue()

          return day ? getFullDate({ date: localDay(day) }) : t("detail.open")
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
    [t, getFullDate, batchLabel]
  )

  if (isError) {
    throw error
  }

  return (
    <Container className="divide-y p-0">
      <DataTable
        data={data?.vouchers}
        columns={columns}
        filters={filters}
        rowCount={data?.count}
        getRowId={(voucher) => voucher.id}
        pageSize={PAGE_SIZE}
        enableSearch={false}
        prefix={VOUCHERS_PREFIX}
        isLoading={isPending}
        heading={t("detail.vouchers")}
        headingLevel="h2"
        emptyState={{
          empty: { heading: t("detail.noVouchers") },
          filtered: { heading: t("detail.noVouchers") },
        }}
      />
    </Container>
  )
}

const VoucherProductPage = () => {
  const { t } = useTranslation(VOUCHER_NS)
  const { id } = useParams()
  const { data, isPending, isError, error } = useVoucherProduct(id!)

  // The dashboard's error page tells a missing Voucher product from a failure.
  if (isError) {
    throw error
  }

  if (isPending) {
    return null
  }

  const voucherProduct = data.voucher_product

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="flex flex-col gap-y-1 px-6 py-4">
        <Heading>
          {voucherProduct.product_variant.product.title} · {voucherProduct.product_variant.title}
        </Heading>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {t("list.faceValue")}:{" "}
          {getLocaleAmount(voucherProduct.face_value, voucherProduct.currency_code)}
        </Text>
      </Container>
      <PoolSection counts={voucherProduct.counts} />
      <BatchesSection voucherProduct={voucherProduct} />
      <VouchersSection voucherProduct={voucherProduct} />
      {/* The import dialog opens over the page. */}
      <Outlet />
    </div>
  )
}

const VoucherProductBreadcrumb = ({ params }: UIMatch) => {
  const { data } = useVoucherProduct(params.id!)

  if (!data) {
    return null
  }

  const { product_variant } = data.voucher_product

  return (
    <span>
      {product_variant.product.title} · {product_variant.title}
    </span>
  )
}

export const handle = {
  breadcrumb: (match: UIMatch) => <VoucherProductBreadcrumb {...match} />,
}

export default VoucherProductPage
