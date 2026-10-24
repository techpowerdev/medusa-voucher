import { zodResolver } from "@hookform/resolvers/zod"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { ActionMenu, Form, KeyboundForm, SectionRow } from "@medusajs/dashboard/components"
import { useStore } from "@medusajs/dashboard/hooks"
import { getCurrencySymbol, getLocaleAmount } from "@medusajs/dashboard/lib"
import { DetailWidgetProps, HttpTypes } from "@medusajs/framework/types"
import { PencilSquare } from "@medusajs/icons"
import {
  Button,
  Container,
  CurrencyInput,
  Drawer,
  FocusModal,
  Heading,
  Select,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useForm, UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import * as zod from "zod"
import {
  createVoucherProduct,
  POOL_STATUSES,
  retrieveVariantVoucherProductId,
  retrieveVoucherProduct,
  updateVoucherProduct,
  VOUCHER_NS,
  VoucherProduct,
} from "../lib/vouchers"

type VoucherProductValues = { face_value: string; currency_code: string }

type VoucherProductForm = UseFormReturn<VoucherProductValues>

// The form's rules, with messages in the admin's language: the form shows a message as given.
const useVoucherProductSchema = () => {
  const { t } = useTranslation(VOUCHER_NS)

  return useMemo(
    () =>
      zod.object({
        face_value: zod.string().refine((value) => parseFloat(value) > 0, t("widget.faceValueRequired")),
        currency_code: zod.string().min(1, t("widget.currencyRequired")),
      }),
    [t]
  )
}

// The API allows changing the Face value or currency only while there are no Vouchers.
const hasVouchers = (voucherProduct: VoucherProduct) =>
  POOL_STATUSES.some((status) => voucherProduct.counts[status] > 0)

const toBody = (data: VoucherProductValues) => ({
  face_value: parseFloat(data.face_value),
  currency_code: data.currency_code,
})

// The Face value and currency, the two fields of both dialogs.
const VoucherProductFields = ({ form }: { form: VoucherProductForm }) => {
  const { t } = useTranslation(VOUCHER_NS)
  const { store } = useStore()
  const currencyCode = form.watch("currency_code")

  return (
    <div className="flex flex-col gap-y-4">
      <Form.Field
        control={form.control}
        name="currency_code"
        render={({ field: { onChange, ref, ...field } }) => (
          <Form.Item>
            <Form.Label>{t("widget.currency")}</Form.Label>
            <Form.Control>
              <Select {...field} onValueChange={onChange}>
                <Select.Trigger ref={ref}>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {store?.supported_currencies?.map(({ currency_code }) => (
                    <Select.Item key={currency_code} value={currency_code}>
                      {currency_code.toUpperCase()}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </Form.Control>
            <Form.ErrorMessage />
          </Form.Item>
        )}
      />
      <Form.Field
        control={form.control}
        name="face_value"
        render={({ field: { onChange, ...field } }) => (
          <Form.Item>
            <Form.Label>{t("list.faceValue")}</Form.Label>
            <Form.Control>
              <CurrencyInput
                min={0}
                code={currencyCode}
                symbol={currencyCode ? getCurrencySymbol(currencyCode) : ""}
                onValueChange={(value) => onChange(value ?? "")}
                {...field}
              />
            </Form.Control>
            <Form.ErrorMessage />
          </Form.Item>
        )}
      />
    </div>
  )
}

// Marks a variant: a FocusModal, as the dashboard uses to create a resource.
const MarkVoucherProduct = ({ variant }: { variant: HttpTypes.AdminProductVariant }) => {
  const { t } = useTranslation(VOUCHER_NS)
  const { t: tDashboard } = useTranslation()
  const queryClient = useQueryClient()
  const { store } = useStore()
  const [open, setOpen] = useState(false)
  const defaultCurrency =
    store?.supported_currencies?.find((currency) => currency.is_default)?.currency_code ?? ""

  const schema = useVoucherProductSchema()
  const form = useForm<VoucherProductValues>({
    values: { face_value: "", currency_code: defaultCurrency },
    resolver: zodResolver(schema),
  })

  const { mutateAsync, isPending } = useMutation({
    mutationFn: createVoucherProduct,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["variant-voucher-product", variant.id] }),
        queryClient.invalidateQueries({ queryKey: ["voucher-products"] }),
      ]),
  })

  const handleSubmit = form.handleSubmit(async (data) => {
    await mutateAsync(
      { variant_id: variant.id, ...toBody(data) },
      {
        onSuccess: () => {
          toast.success(t("widget.marked"))
          setOpen(false)
        },
        onError: (error) => toast.error(error.message),
      }
    )
  })

  return (
    <FocusModal open={open} onOpenChange={setOpen}>
      <FocusModal.Trigger asChild>
        <Button size="small" variant="secondary">
          {t("widget.mark")}
        </Button>
      </FocusModal.Trigger>
      <FocusModal.Content>
        <Form {...form}>
          <KeyboundForm onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
            <FocusModal.Header />
            <FocusModal.Body className="flex flex-1 flex-col items-center overflow-y-auto py-16">
              <div className="flex w-full max-w-[720px] flex-col gap-y-8">
                <div>
                  <FocusModal.Title asChild>
                    <Heading>{t("widget.markTitle")}</Heading>
                  </FocusModal.Title>
                  <FocusModal.Description asChild>
                    <Text size="small" className="text-ui-fg-subtle">
                      {t("widget.markHint")}
                    </Text>
                  </FocusModal.Description>
                </div>
                <VoucherProductFields form={form} />
              </div>
            </FocusModal.Body>
            <FocusModal.Footer>
              <div className="flex items-center justify-end gap-x-2">
                <FocusModal.Close asChild>
                  <Button size="small" variant="secondary">
                    {tDashboard("actions.cancel")}
                  </Button>
                </FocusModal.Close>
                <Button size="small" type="submit" isLoading={isPending}>
                  {t("widget.save")}
                </Button>
              </div>
            </FocusModal.Footer>
          </KeyboundForm>
        </Form>
      </FocusModal.Content>
    </FocusModal>
  )
}

// Changes the Face value or currency: a Drawer, as the dashboard uses to edit a resource.
const EditVoucherProduct = ({
  voucherProduct,
  open,
  onOpenChange,
}: {
  voucherProduct: VoucherProduct
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const { t } = useTranslation(VOUCHER_NS)
  const { t: tDashboard } = useTranslation()
  const queryClient = useQueryClient()

  const schema = useVoucherProductSchema()
  const form = useForm<VoucherProductValues>({
    values: {
      face_value: String(voucherProduct.face_value),
      currency_code: voucherProduct.currency_code,
    },
    resolver: zodResolver(schema),
  })

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (body: ReturnType<typeof toBody>) => updateVoucherProduct(voucherProduct.id, body),
    // Also after a refusal: Vouchers imported meanwhile then lock the edit action.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["voucher-product", voucherProduct.id] }),
        queryClient.invalidateQueries({ queryKey: ["voucher-products"] }),
      ]),
  })

  const handleSubmit = form.handleSubmit(async (data) => {
    await mutateAsync(toBody(data), {
      onSuccess: () => {
        toast.success(t("widget.saved"))
        onOpenChange(false)
      },
      // The API refuses once the Voucher product has Vouchers, as when some were imported while
      // the drawer was open: say so in the admin's language. Any other refusal is shown as given.
      onError: async (error) => {
        const latest = await queryClient
          .fetchQuery({
            queryKey: ["voucher-product", voucherProduct.id],
            queryFn: () => retrieveVoucherProduct(voucherProduct.id),
            staleTime: 0,
          })
          .catch(() => undefined)

        if (latest && hasVouchers(latest.voucher_product)) {
          toast.error(t("widget.locked"))
          onOpenChange(false)
        } else {
          toast.error(error.message)
        }
      },
    })
  })

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content>
        <Form {...form}>
          <KeyboundForm onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
            <Drawer.Header>
              <Drawer.Title asChild>
                <Heading>{t("widget.editTitle")}</Heading>
              </Drawer.Title>
              <Drawer.Description className="sr-only">{t("widget.markHint")}</Drawer.Description>
            </Drawer.Header>
            <Drawer.Body className="flex-1 overflow-y-auto">
              <VoucherProductFields form={form} />
            </Drawer.Body>
            <Drawer.Footer>
              <div className="flex items-center justify-end gap-x-2">
                <Drawer.Close asChild>
                  <Button size="small" variant="secondary">
                    {tDashboard("actions.cancel")}
                  </Button>
                </Drawer.Close>
                <Button size="small" type="submit" isLoading={isPending}>
                  {t("widget.save")}
                </Button>
              </div>
            </Drawer.Footer>
          </KeyboundForm>
        </Form>
      </Drawer.Content>
    </Drawer>
  )
}

// Shown in the box when its data cannot be read: the box neither offers to mark the variant,
// which may already be a Voucher product, nor takes the rest of the page down with it.
const LoadFailed = () => {
  const { t } = useTranslation(VOUCHER_NS)

  return (
    <>
      <div className="px-6 py-4">
        <Heading level="h2">{t("widget.title")}</Heading>
      </div>
      <div className="px-6 py-4">
        <Text size="small" className="text-ui-fg-error">
          {t("widget.loadFailed")}
        </Text>
      </div>
    </>
  )
}

const MarkedVoucherProduct = ({ voucherProductId }: { voucherProductId: string }) => {
  const { t, i18n } = useTranslation(VOUCHER_NS)
  const { t: tDashboard } = useTranslation()
  const [editing, setEditing] = useState(false)

  const { data, isError } = useQuery({
    queryKey: ["voucher-product", voucherProductId],
    queryFn: () => retrieveVoucherProduct(voucherProductId),
  })

  if (isError) {
    return <LoadFailed />
  }

  if (!data) {
    return null
  }

  const voucherProduct = data.voucher_product

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">{t("widget.title")}</Heading>
        <ActionMenu
          groups={[
            {
              actions: [
                {
                  label: tDashboard("actions.edit"),
                  icon: <PencilSquare />,
                  onClick: () => setEditing(true),
                  disabled: hasVouchers(voucherProduct),
                  disabledTooltip: t("widget.locked"),
                },
              ],
            },
          ]}
        />
      </div>
      <SectionRow
        title={t("list.faceValue")}
        value={getLocaleAmount(voucherProduct.face_value, voucherProduct.currency_code)}
      />
      <SectionRow
        title={t("widget.available")}
        value={voucherProduct.counts.available.toLocaleString(i18n.language)}
      />
      <div className="px-6 py-4">
        <Link
          to={`/vouchers/${voucherProduct.id}`}
          className="txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
        >
          {t("widget.view")}
        </Link>
      </div>
      <EditVoucherProduct voucherProduct={voucherProduct} open={editing} onOpenChange={setEditing} />
    </>
  )
}

const VariantVoucherProductWidget = ({ data: variant }: DetailWidgetProps<HttpTypes.AdminProductVariant>) => {
  const { t } = useTranslation(VOUCHER_NS)

  const { data: voucherProductId, isPending, isError } = useQuery({
    queryKey: ["variant-voucher-product", variant.id],
    queryFn: () => retrieveVariantVoucherProductId(variant.product_id!, variant.id),
  })

  if (isPending) {
    return null
  }

  return (
    <Container className="divide-y p-0">
      {isError ? (
        <LoadFailed />
      ) : voucherProductId ? (
        <MarkedVoucherProduct voucherProductId={voucherProductId} />
      ) : (
        <>
          <div className="px-6 py-4">
            <Heading level="h2">{t("widget.title")}</Heading>
          </div>
          <div className="flex flex-col items-start gap-y-3 px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              {t("widget.notMarked")}
            </Text>
            <MarkVoucherProduct variant={variant} />
          </div>
        </>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product_variant.details.side",
})

export default VariantVoucherProductWidget
