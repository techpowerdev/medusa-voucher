import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  ResolveAllocationFailureInput,
  resolveVoucherAllocationFailureStep,
} from "./steps/resolve-voucher-allocation-failure"

export const resolveAllocationFailureWorkflowId = "resolve-voucher-allocation-failure"

/** Closes an open Allocation failure that a person settled, with their note and identity. */
export const resolveAllocationFailureWorkflow = createWorkflow(
  resolveAllocationFailureWorkflowId,
  (input: ResolveAllocationFailureInput) => {
    return new WorkflowResponse(resolveVoucherAllocationFailureStep(input))
  }
)
