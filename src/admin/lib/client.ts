import Medusa from "@medusajs/js-sdk"

export const backendUrl = import.meta.env.VITE_BACKEND_URL || "/"

export const sdk = new Medusa({
  baseUrl: backendUrl,
  debug: import.meta.env.DEV,
  auth: {
    type: "session",
  },
})
