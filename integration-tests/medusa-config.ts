import path from "path"
import { loadEnv, defineConfig } from "@medusajs/framework/utils"

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
  plugins: [
    {
      resolve: path.resolve(__dirname, ".."),
      options: {
        encryptionKey: "test-only-key-for-integration-tests-0123456789",
        // A Voucher needs at least this many days of validity left to be allocated.
        minimumRemainingValidityDays: 7,
      },
    },
  ],
})
