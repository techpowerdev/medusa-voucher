import { MedusaContainer } from "@medusajs/framework/types"
import { generateJwtToken, Modules } from "@medusajs/framework/utils"
import { createApiKeysWorkflow } from "@medusajs/medusa/core-flows"

// Must match `http.jwtSecret` in integration-tests/medusa-config.ts.
const JWT_SECRET = "supersecret"

// A publishable API key, which every /store route requires.
export async function createPublishableKey(container: MedusaContainer) {
  const {
    result: [apiKey],
  } = await createApiKeysWorkflow(container).run({
    input: { api_keys: [{ title: "Storefront", type: "publishable", created_by: "test" }] },
  })

  return apiKey.token
}

// A registered customer and the headers of a request signed in as them.
export async function createCustomerHeaders(
  container: MedusaContainer,
  email: string,
  publishableKey: string
) {
  const customer = await container
    .resolve(Modules.CUSTOMER)
    .createCustomers({ email, has_account: true })
  const identity = await container.resolve(Modules.AUTH).createAuthIdentities({
    provider_identities: [{ provider: "emailpass", entity_id: email }],
    app_metadata: { customer_id: customer.id },
  })
  const token = generateJwtToken(
    {
      actor_id: customer.id,
      actor_type: "customer",
      auth_identity_id: identity.id,
      app_metadata: { customer_id: customer.id },
    },
    { secret: JWT_SECRET, expiresIn: "1d" }
  )

  return {
    customerId: customer.id,
    headers: {
      headers: { authorization: `Bearer ${token}`, "x-publishable-api-key": publishableKey },
    },
  }
}
