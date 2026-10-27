import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { SectionRow } from "@medusajs/dashboard/components"
import { DetailWidgetProps, HttpTypes } from "@medusajs/framework/types"
import { ExclamationCircleSolid } from "@medusajs/icons"
import { Container, Heading, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { AllocationFailure, listOrderAllocationFailures, VOUCHER_NS } from "../lib/vouchers"

// The Voucher product a failure is short of, named by the Medusa product and variant of the
// order line, as the plugin's other pages name it; the order line keeps its titles if the
// variant has since been deleted.
const voucherProductName = (failure: AllocationFailure, order: HttpTypes.AdminOrder) => {
  const item = order.items?.find((line) => line.id === failure.order_line_item_id)
  const product = item?.variant?.product?.title ?? item?.product_title
  const variant = item?.variant?.title ?? item?.variant_title

  return [product, variant].filter(Boolean).join(" · ")
}

const FailureRow = ({ failure, order }: { failure: AllocationFailure; order: HttpTypes.AdminOrder }) => {
  const { t, i18n } = useTranslation(VOUCHER_NS)
  const units = t("failures.requestedAvailable", {
    requested: failure.quantity_requested.toLocaleString(i18n.language),
    available: failure.quantity_available.toLocaleString(i18n.language),
  })

  return (
    <SectionRow
      title={voucherProductName(failure, order)}
      value={
        <div className="flex flex-col gap-y-1">
          <Text size="small" leading="compact">
            {units}
          </Text>
          {failure.voucher_product_id && (
            <Link
              to={`/vouchers/${failure.voucher_product_id}`}
              className="txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
            >
              {t("widget.view")}
            </Link>
          )}
        </div>
      }
    />
  )
}

// Tells staff that the order waits for Vouchers and where it can be settled. It shows nothing
// for an order without an open Allocation failure.
const OrderAllocationFailuresWidget = ({ data: order }: DetailWidgetProps<HttpTypes.AdminOrder>) => {
  const { t } = useTranslation(VOUCHER_NS)

  const { data, isError } = useQuery({
    queryKey: ["voucher-allocation-failures", "order", order.id],
    queryFn: () => listOrderAllocationFailures(order.id),
  })

  if (isError) {
    return (
      <Container className="px-6 py-4">
        <Text size="small" className="text-ui-fg-error">
          {t("orderWidget.loadFailed")}
        </Text>
      </Container>
    )
  }

  if (!data?.voucher_allocation_failures.length) {
    return null
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <div className="flex items-center gap-x-2">
          <ExclamationCircleSolid className="text-ui-fg-subtle" />
          <Heading level="h2">{t("orderWidget.title")}</Heading>
        </div>
        <Text size="small" className="text-ui-fg-subtle">
          {t("orderWidget.hint")}
        </Text>
      </div>
      {data.voucher_allocation_failures.map((failure) => (
        <FailureRow key={failure.id} failure={failure} order={order} />
      ))}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details",
})

export default OrderAllocationFailuresWidget
