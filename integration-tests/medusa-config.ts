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
      options: {},
    },
  ],
})
