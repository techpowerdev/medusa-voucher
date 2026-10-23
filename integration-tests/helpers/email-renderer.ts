import { renderVoucherEmail, VoucherEmailInput } from "../../src/workflows/utils/render-voucher-email"

// The test app's `delivery.renderers.email` calls this, so a test can replace the email with
// `jest.spyOn(testEmailRenderer, "render")`; otherwise the plugin's default is used.
export const testEmailRenderer = {
  render: (input: VoucherEmailInput) => renderVoucherEmail(input),
}
