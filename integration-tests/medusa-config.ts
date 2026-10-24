import path from "path"
import { loadEnv, defineConfig } from "@medusajs/framework/utils"
import { VoucherEmailInput } from "../src/modules/voucher/types"
import { testEmailRenderer } from "./helpers/email-renderer"

loadEnv("test", process.cwd())

// Test-only Medusa app that loads this plugin from its build output (.medusa/server).
// `pnpm test:integration:http` runs `pnpm build` first.
module.exports = defineConfig({
  projectConfig: {
    http: {
      jwtSecret: "supersecret",
      cookieSecret: "supersecret",
      storeCors: "*",
      adminCors: "*",
      authCors: "*",
    },
  },
  // Declaring the Notification module replaces Medusa's default, which has only `feed`.
  // The local provider on `email` lets delivery tests observe what would be sent.
  modules: [
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/notification-local",
            id: "local",
            options: { name: "Local Notification Provider", channels: ["email", "feed"] },
          },
        ],
      },
    },
  ],
  plugins: [
    {
      resolve: path.resolve(__dirname, ".."),
      options: {
        encryptionKey: "test-only-key-for-integration-tests-0123456789",
        // A Voucher needs at least this many days of validity left to be allocated.
        minimumRemainingValidityDays: 7,
        // A spec that calls the delivery workflow itself sets this to "false" before the
        // runner loads this file, so allocations in it do not send on their own.
        delivery: {
          automatic: process.env.VOUCHER_TEST_DELIVERY_AUTOMATIC !== "false",
          // Same for fulfillment, in a spec that checks it can be turned off.
          fulfill: process.env.VOUCHER_TEST_DELIVERY_FULFILL !== "false",
          // A getter, so each test can supply the shipping option it created; the plugin
          // reads it on every fulfillment.
          fulfillment: {
            get shippingOptionId() {
              return process.env.VOUCHER_TEST_SHIPPING_OPTION_ID
            },
          },
          renderers: { email: (input: VoucherEmailInput) => testEmailRenderer.render(input) },
        },
      },
    },
  ],
})
