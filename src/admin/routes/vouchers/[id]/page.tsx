import { DataTable } from "@medusajs/dashboard/components"
import { useDate, useQueryParams, useUser } from "@medusajs/dashboard/hooks"
import { getLocaleAmount } from "@medusajs/dashboard/lib"
import { CheckCircle } from "@medusajs/icons"
import {
  Avatar,
  Container,
  createDataTableColumnHelper,
  createDataTableFilterHelper,
  Heading,
  Label,
  Prompt,
  StatusBadge,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { keepPreviousData, QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FormEvent, useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, Outlet, UIMatch, useParams } from "react-router-dom"
import { describeRetryResult } from "../../../lib/allocation-retry"
import {
  ALLOCATION_FAILURE_RESOLVED_BY_SYSTEM,
  AllocationFailure,
  AllocationFailureStatus,
  listAllocationFailures,
  listPoolVouchers,
  listVoucherBatches,
  POOL_STATUSES,
  PoolCounts,
  PoolStatus,
  PoolVoucher,
  resolveAllocationFailure,
  retrieveVoucherProduct,
  retryAllocationFailures,
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
const FAILURES_PREFIX = "f"

const batchColumns = createDataTableColumnHelper<VoucherBatch>()
const voucherColumns = createDataTableColumnHelper<PoolVoucher>()
const voucherFilters = createDataTableFilterHelper<{ status: PoolStatus; batch_id: string }>()
const failureColumns = createDataTableColumnHelper<AllocationFailure>()
const failureFilters = createDataTableFilterHelper<{ status: AllocationFailureStatus }>()

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

// Who settled an Allocation failure: the system when its order got its Vouchers, otherwise the
// admin user, shown by name as the dashboard shows who revoked an API key.
const ResolvedBy = ({ actor }: { actor: string | null }) => {
  const { t } = useTranslation(VOUCHER_NS)
  const isUser = !!actor && actor !== ALLOCATION_FAILURE_RESOLVED_BY_SYSTEM
  const { user, isError, error } = useUser(actor!, undefined, { enabled: isUser })

  if (isError) {
    throw error
  }

  if (actor === ALLOCATION_FAILURE_RESOLVED_BY_SYSTEM) {
    return t("failures.system")
  }

  if (!user) {
    return "-"
  }

  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email

  return (
    <Link to={`/settings/users/${user.id}`} className="flex w-fit items-center gap-x-2 hover:underline">
      <Avatar size="2xsmall" fallback={name.slice(0, 1).toUpperCase()} />
      {name}
    </Link>
  )
}

// A retry or a resolve changes the waiting orders and, for a retry, the Pool, so the page and
// the Vouchers list read them again.
const refreshAfterSettling = (queryClient: QueryClient, voucherProductId: string) =>
  Promise.all(
    [
      ["voucher-allocation-failures"],
      ["voucher-product", voucherProductId],
      ["voucher-batches", voucherProductId],
      ["pool-vouchers", voucherProductId],
      ["voucher-products"],
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
  )

// The order a failure waits on, by its display number when the order still has one.
const orderLabel = (failure: AllocationFailure) => failure.display_id ?? failure.order_id

// Asks for the note a resolve requires, in the dashboard's prompt, with a text area where the
// dashboard's own `usePrompt` only offers a line to type a given word.
const ResolvePrompt = ({
  failure,
  voucherProductId,
  onClose,
}: {
  failure: AllocationFailure
  voucherProductId: string
  onClose: () => void
}) => {
  const { t } = useTranslation(VOUCHER_NS)
  const { t: tDashboard } = useTranslation()
  const queryClient = useQueryClient()
  const [note, setNote] = useState("")

  const { mutateAsync, isPending } = useMutation({
    mutationFn: () => resolveAllocationFailure(failure.id, note.trim()),
    onSuccess: () => refreshAfterSettling(queryClient, voucherProductId),
  })

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    if (!note.trim()) {
      return
    }

    await mutateAsync(undefined, {
      onSuccess: () => {
        toast.success(t("failures.resolve.success", { order: orderLabel(failure) }))
        onClose()
      },
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    // Kept open until the resolve ends; Escape closes it as it closes the dashboard's prompt.
    <Prompt open variant="confirmation">
      <Prompt.Content onEscapeKeyDown={() => !isPending && onClose()}>
        <form onSubmit={handleSubmit}>
          <Prompt.Header>
            <Prompt.Title>{tDashboard("general.areYouSure")}</Prompt.Title>
            <Prompt.Description>
              {t("failures.resolve.description", { order: orderLabel(failure) })}
            </Prompt.Description>
          </Prompt.Header>
          <div className="border-ui-border-base mt-6 flex flex-col gap-y-2 border-y p-6">
            <Label htmlFor="resolution-note" className="text-ui-fg-subtle">
              {t("failures.note")}
            </Label>
            <Textarea
              id="resolution-note"
              autoFocus
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <Text size="small" className="text-ui-fg-subtle">
              {t("failures.resolve.noteHint")}
            </Text>
          </div>
          <Prompt.Footer>
            <Prompt.Cancel type="button" onClick={onClose} disabled={isPending}>
              {tDashboard("actions.cancel")}
            </Prompt.Cancel>
            <Prompt.Action type="submit" disabled={!note.trim() || isPending}>
              {t("failures.resolve.action")}
            </Prompt.Action>
          </Prompt.Footer>
        </form>
      </Prompt.Content>
    </Prompt>
  )
}

const AllocationFailuresSection = ({ voucherProduct }: { voucherProduct: VoucherProduct }) => {
  const { t, i18n } = useTranslation(VOUCHER_NS)
  const { getFullDate } = useDate()
  const queryClient = useQueryClient()
  const [resolving, setResolving] = useState<AllocationFailure>()

  const retry = useMutation({
    mutationFn: () => retryAllocationFailures(voucherProduct.id),
    onSuccess: () => refreshAfterSettling(queryClient, voucherProduct.id),
  })

  const handleRetry = () =>
    retry.mutate(undefined, {
      onSuccess: (result) => {
        const { variant, key, values } = describeRetryResult(result, (value) =>
          value.toLocaleString(i18n.language)
        )
        toast[variant](t("failures.retry.done"), { description: t(key, values) })
      },
      onError: (error) => toast.error(error.message),
    })
  const { offset, status } = useQueryParams(["offset", "status"], FAILURES_PREFIX)
  // Without a filter the section shows the orders still waiting, as the API does.
  const failureStatus = filterValue<AllocationFailureStatus>(status) ?? AllocationFailureStatus.OPEN

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["voucher-allocation-failures", voucherProduct.id, offset, failureStatus],
    queryFn: () =>
      listAllocationFailures(voucherProduct.id, {
        limit: PAGE_SIZE,
        offset: offset ? parseInt(offset) : 0,
        status: failureStatus,
      }),
    placeholderData: keepPreviousData,
  })

  const filters = useMemo(
    () => [
      failureFilters.accessor("status", {
        type: "radio",
        label: t("detail.status"),
        options: [
          { label: t("failures.waiting"), value: AllocationFailureStatus.OPEN },
          { label: t("failures.settled"), value: AllocationFailureStatus.RESOLVED },
        ],
      }),
    ],
    [t]
  )

  const columns = useMemo(
    () => [
      failureColumns.accessor("display_id", {
        header: t("detail.order"),
        cell: ({ row }) => (
          <Link to={`/orders/${row.original.order_id}`} className="text-ui-fg-interactive hover:underline">
            #{row.original.display_id ?? row.original.order_id}
          </Link>
        ),
      }),
      failureColumns.accessor("email", {
        header: t("failures.email"),
        cell: ({ getValue }) => getValue() ?? "-",
      }),
      ...(failureStatus === AllocationFailureStatus.OPEN
        ? [
            failureColumns.display({
              id: "quantity",
              header: t("failures.quantity"),
              cell: ({ row }) =>
                t("failures.requestedAvailable", {
                  requested: row.original.quantity_requested,
                  available: row.original.quantity_available,
                }),
            }),
            failureColumns.accessor("created_at", {
              header: t("failures.date"),
              cell: ({ getValue }) => getFullDate({ date: getValue(), includeTime: true }),
            }),
            // A settled order cannot be reopened, so only waiting rows have an action.
            failureColumns.action({
              actions: [
                {
                  label: t("failures.resolve.action"),
                  icon: <CheckCircle />,
                  onClick: ({ row }) => setResolving(row.original),
                },
              ],
            }),
          ]
        : [
            failureColumns.accessor("resolved_at", {
              header: t("failures.settledAt"),
              cell: ({ getValue }) => {
                const resolvedAt = getValue()

                return resolvedAt ? getFullDate({ date: resolvedAt, includeTime: true }) : "-"
              },
            }),
            failureColumns.accessor("resolved_by", {
              header: t("failures.settledBy"),
              cell: ({ getValue }) => <ResolvedBy actor={getValue()} />,
            }),
            failureColumns.accessor("resolution_note", {
              header: t("failures.note"),
              // The system's own note is stored in English; show it in the admin's language.
              cell: ({ getValue, row }) =>
                row.original.resolved_by === ALLOCATION_FAILURE_RESOLVED_BY_SYSTEM
                  ? t("failures.systemNote")
                  : getValue() ?? "-",
            }),
          ]),
    ],
    [t, getFullDate, failureStatus]
  )

  if (isError) {
    throw error
  }

  return (
    <Container className="divide-y p-0">
      <DataTable
        data={data?.voucher_allocation_failures}
        columns={columns}
        filters={filters}
        rowCount={data?.count}
        getRowId={(failure) => failure.id}
        pageSize={PAGE_SIZE}
        enableSearch={false}
        prefix={FAILURES_PREFIX}
        isLoading={isPending}
        heading={t("failures.title")}
        headingLevel="h2"
        action={{
          label: t("failures.retry.action"),
          onClick: handleRetry,
          disabled: retry.isPending,
        }}
        emptyState={{
          empty: { heading: t("failures.noneWaiting") },
          filtered: {
            heading:
              failureStatus === AllocationFailureStatus.OPEN
                ? t("failures.noneWaiting")
                : t("failures.noneSettled"),
          },
        }}
      />
      {resolving && (
        <ResolvePrompt
          failure={resolving}
          voucherProductId={voucherProduct.id}
          onClose={() => setResolving(undefined)}
        />
      )}
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
      <AllocationFailuresSection voucherProduct={voucherProduct} />
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
