import { Modules } from "@medusajs/framework/utils"
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createRemoteLinkStep } from "@medusajs/medusa/core-flows"
import { VOUCHER_MODULE } from "../modules/voucher"
import {
  createVoucherProductStep,
  CreateVoucherProductStepInput,
} from "./steps/create-voucher-product"
import { assertVariantNotAVoucherProductStep } from "./steps/assert-variant-not-a-voucher-product"
import { validateVoucherVariantStep } from "./steps/validate-voucher-variant"

export type CreateVoucherProductInput = CreateVoucherProductStepInput & {
  variant_id: string
}

export const createVoucherProductWorkflowId = "create-voucher-product"

/** Marks an existing product variant as a Voucher product (ADR-0003). */
export const createVoucherProductWorkflow = createWorkflow(
  createVoucherProductWorkflowId,
  (input: CreateVoucherProductInput) => {
    validateVoucherVariantStep({ variant_id: input.variant_id })
    assertVariantNotAVoucherProductStep({ variant_id: input.variant_id })

    const productInput = transform({ input }, ({ input }) => ({
      face_value: input.face_value,
      currency_code: input.currency_code,
    }))
    const voucherProduct = createVoucherProductStep(productInput)

    const links = transform({ input, voucherProduct }, ({ input, voucherProduct }) => [
      {
        [VOUCHER_MODULE]: { voucher_product_id: voucherProduct.id },
        [Modules.PRODUCT]: { product_variant_id: input.variant_id },
      },
    ])
    createRemoteLinkStep(links)

    return new WorkflowResponse(voucherProduct)
  }
)
