import { zodResolver } from "@hookform/resolvers/zod"
import { Form, KeyboundForm, RouteFocusModal, useRouteModal } from "@medusajs/dashboard/components"
import { getCurrencySymbol } from "@medusajs/dashboard/lib"
import {
  Alert,
  Button,
  CurrencyInput,
  DatePicker,
  Heading,
  Input,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChangeEvent, useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"
import * as zod from "zod"
import { countCsvRows } from "../../../../lib/csv"
import { describeImportAllocationRetry } from "../../../../lib/import-allocation-retry"
import { describeImportFailure, ImportFailureView } from "../../../../lib/import-problems"
import {
  importVoucherBatch,
  listVoucherBatches,
  MAX_IMPORT_ROWS,
  retrieveVoucherProduct,
  VOUCHER_NS,
} from "../../../../lib/vouchers"

const ImportSchema = zod.object({
  purchased_at: zod.date(),
  unit_cost: zod.string().optional(),
  reference: zod.string().optional(),
  redemption_instructions: zod.string().optional(),
})

// The CSV read in the browser. Only its name and row count are shown.
type CsvFile = { name: string; csv: string; rows: number }

const today = () => {
  const day = new Date()
  day.setHours(0, 0, 0, 0)

  return day
}

// The day chosen in the picker as YYYY-MM-DD, read where the admin is. The API stores the
// start of that day in the plugin's time zone, so the batch shows this day everywhere.
const calendarDay = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")

const ImportForm = ({ voucherProductId }: { voucherProductId: string }) => {
  const { t, i18n } = useTranslation(VOUCHER_NS)
  const { t: tDashboard } = useTranslation()
  const number = (value: number) => value.toLocaleString(i18n.language)
  const { handleSuccess } = useRouteModal()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<CsvFile>()
  const [fileError, setFileError] = useState<string>()
  const [failure, setFailure] = useState<ImportFailureView>()

  const { data: product } = useQuery({
    queryKey: ["voucher-product", voucherProductId],
    queryFn: () => retrieveVoucherProduct(voucherProductId),
  })
  // Batches come newest purchase first, so the first is the latest.
  const { data: latest } = useQuery({
    queryKey: ["voucher-batches", voucherProductId, "latest"],
    queryFn: () => listVoucherBatches(voucherProductId, { limit: 1, offset: 0 }),
  })

  const form = useForm<zod.infer<typeof ImportSchema>>({
    defaultValues: { purchased_at: today(), unit_cost: "", reference: "", redemption_instructions: "" },
    resolver: zodResolver(ImportSchema),
  })

  const latestInstructions = latest?.batches[0]?.redemption_instructions
  useEffect(() => {
    if (latestInstructions && !form.getFieldState("redemption_instructions").isDirty) {
      form.setValue("redemption_instructions", latestInstructions)
    }
  }, [latestInstructions, form])

  const { mutateAsync, isPending } = useMutation({
    mutationFn: importVoucherBatch,
    onSuccess: () =>
      Promise.all(
        [
          ["voucher-product", voucherProductId],
          ["voucher-batches", voucherProductId],
          ["voucher-batch-options", voucherProductId],
          ["pool-vouchers", voucherProductId],
          ["voucher-products"],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
      ),
  })

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0]
    event.target.value = ""

    if (!chosen) {
      return
    }

    const csv = await chosen.text()
    setFile({ name: chosen.name, csv, rows: countCsvRows(csv) })
    setFileError(undefined)
    setFailure(undefined)
  }

  const tooMany = !!file && file.rows > MAX_IMPORT_ROWS

  const handleSubmit = form.handleSubmit(async (data) => {
    if (!file) {
      setFileError(t("import.fileRequired"))
      return
    }

    setFailure(undefined)

    await mutateAsync(
      {
        voucher_product_id: voucherProductId,
        purchased_at: calendarDay(data.purchased_at),
        unit_cost: data.unit_cost ? parseFloat(data.unit_cost) : null,
        reference: data.reference || null,
        redemption_instructions: data.redemption_instructions || null,
        csv: file.csv,
      },
      {
        onSuccess: ({ imported, allocation_retry }) => {
          const title = t("import.success", { imported: number(imported) })
          const retry = describeImportAllocationRetry(allocation_retry, number)
          const description = retry?.lines.map(({ key, values }) => t(key, values)).join(" ")

          if (retry?.level === "warning") {
            toast.warning(title, { description })
          } else {
            toast.success(title, { description })
          }

          handleSuccess()
        },
        onError: (error) => setFailure(describeImportFailure(error, number)),
      }
    )
  })

  const currencyCode = product?.voucher_product.currency_code

  return (
    <RouteFocusModal.Form form={form}>
      <KeyboundForm onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
        <RouteFocusModal.Header />
        <RouteFocusModal.Body className="flex flex-1 flex-col items-center overflow-y-auto py-16">
          <div className="flex w-full max-w-[720px] flex-col gap-y-8">
            <div>
              <RouteFocusModal.Title asChild>
                <Heading>{t("import.title")}</Heading>
              </RouteFocusModal.Title>
              <RouteFocusModal.Description asChild>
                <Text size="small" className="text-ui-fg-subtle">
                  {t("import.hint")}
                </Text>
              </RouteFocusModal.Description>
            </div>
            {failure && (
              <Alert variant="error">
                <Text size="small" weight="plus">
                  {t("import.failed")}
                </Text>
                {"message" in failure ? (
                  <Text size="small">{failure.message}</Text>
                ) : (
                  <ul className="mt-2 list-disc pl-5">
                    {failure.problems.map(({ key, values }, index) => (
                      <li key={index}>
                        <Text size="small">{t(key, values)}</Text>
                      </li>
                    ))}
                    {failure.more > 0 && (
                      <li>
                        <Text size="small">{t("import.moreProblems", { more: number(failure.more) })}</Text>
                      </li>
                    )}
                  </ul>
                )}
              </Alert>
            )}
            <div className="flex flex-col gap-y-2">
              <Text size="small" weight="plus">
                {t("import.file")}
              </Text>
              <div className="flex items-center gap-x-3">
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={chooseFile}
                />
                <Button
                  size="small"
                  variant="secondary"
                  type="button"
                  onClick={() => fileInput.current?.click()}
                >
                  {t("import.chooseFile")}
                </Button>
                {file && (
                  <Text size="small" className="text-ui-fg-subtle">
                    {t("import.fileSummary", { name: file.name, rows: number(file.rows) })}
                  </Text>
                )}
              </div>
              {(fileError || tooMany || file?.rows === 0) && (
                <Text size="small" className="text-ui-fg-error">
                  {fileError ??
                    (tooMany
                      ? t("import.tooManyRows", { rows: number(file!.rows), max: number(MAX_IMPORT_ROWS) })
                      : t("import.noRows"))}
                </Text>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Form.Field
                control={form.control}
                name="purchased_at"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label>{t("detail.purchasedAt")}</Form.Label>
                    <Form.Control>
                      <DatePicker {...field} />
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )}
              />
              <Form.Field
                control={form.control}
                name="unit_cost"
                render={({ field: { onChange, ...field } }) => (
                  <Form.Item>
                    <Form.Label optional>{t("detail.unitCost")}</Form.Label>
                    <Form.Control>
                      <CurrencyInput
                        min={0}
                        code={currencyCode ?? ""}
                        symbol={currencyCode ? getCurrencySymbol(currencyCode) : ""}
                        onValueChange={(value) => onChange(value ?? "")}
                        {...field}
                      />
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )}
              />
              <Form.Field
                control={form.control}
                name="reference"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label optional>{t("detail.reference")}</Form.Label>
                    <Form.Control>
                      <Input autoComplete="off" {...field} />
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )}
              />
            </div>
            <Form.Field
              control={form.control}
              name="redemption_instructions"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label optional>{t("import.redemptionInstructions")}</Form.Label>
                  <Form.Hint>{t("import.redemptionHint")}</Form.Hint>
                  <Form.Control>
                    <Textarea rows={4} {...field} />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
          </div>
        </RouteFocusModal.Body>
        <RouteFocusModal.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <RouteFocusModal.Close asChild>
              <Button size="small" variant="secondary">
                {tDashboard("actions.cancel")}
              </Button>
            </RouteFocusModal.Close>
            <Button
              size="small"
              variant="primary"
              type="submit"
              isLoading={isPending}
              disabled={tooMany || file?.rows === 0}
            >
              {t("import.submit")}
            </Button>
          </div>
        </RouteFocusModal.Footer>
      </KeyboundForm>
    </RouteFocusModal.Form>
  )
}

const ImportVoucherBatchPage = () => {
  const { id } = useParams()

  return (
    <RouteFocusModal>
      <ImportForm voucherProductId={id!} />
    </RouteFocusModal>
  )
}

export default ImportVoucherBatchPage
