import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  ResolveAllocationFailureInput,
  resolveAllocationFailureStep,
} from "./steps/resolve-allocation-failure"

export const resolveAllocationFailureWorkflowId = "resolve-allocation-failure"

/** Closes an open Allocation failure that a person settled, with their note and identity. */
export const resolveAllocationFailureWorkflow = createWorkflow(
  resolveAllocationFailureWorkflowId,
  (input: ResolveAllocationFailureInput) => {
    return new WorkflowResponse(resolveAllocationFailureStep(input))
  }
)
