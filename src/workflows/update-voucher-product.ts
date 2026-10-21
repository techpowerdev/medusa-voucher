import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { assertVoucherProductHasNoVouchersStep } from "./steps/assert-voucher-product-has-no-vouchers"
import {
  updateVoucherProductStep,
  UpdateVoucherProductStepInput,
} from "./steps/update-voucher-product"

export const updateVoucherProductWorkflowId = "update-voucher-product"

/** Changes a Voucher product's Face value or currency while it holds no Vouchers. */
export const updateVoucherProductWorkflow = createWorkflow(
  updateVoucherProductWorkflowId,
  (input: UpdateVoucherProductStepInput) => {
    assertVoucherProductHasNoVouchersStep({ id: input.id })

    return new WorkflowResponse(updateVoucherProductStep(input))
  }
)
