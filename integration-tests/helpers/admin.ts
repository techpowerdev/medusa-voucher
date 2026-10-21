import { MedusaContainer } from "@medusajs/framework/types"
import { generateJwtToken, Modules } from "@medusajs/framework/utils"

// Must match `http.jwtSecret` in integration-tests/medusa-config.ts.
const JWT_SECRET = "supersecret"

export async function createAdminHeaders(container: MedusaContainer) {
  const user = await container.resolve(Modules.USER).createUsers({
    email: "admin@example.test",
  })
  const identity = await container.resolve(Modules.AUTH).createAuthIdentities({
    provider_identities: [
      { provider: "emailpass", entity_id: "admin@example.test" },
    ],
    app_metadata: { user_id: user.id },
  })
  const token = generateJwtToken(
    {
      actor_id: user.id,
      actor_type: "user",
      auth_identity_id: identity.id,
      app_metadata: { user_id: user.id },
    },
    { secret: JWT_SECRET, expiresIn: "1d" }
  )

  return { headers: { authorization: `Bearer ${token}` } }
}

// Creates a product with one variant through the Product module and returns the variant id.
export async function createVariant(container: MedusaContainer, title = "100") {
  const [product] = await container.resolve(Modules.PRODUCT).createProducts([
    {
      title: `Example voucher ${title}`,
      options: [{ title: "Face value", values: [title] }],
      variants: [{ title, options: { "Face value": title } }],
    },
  ])

  return product.variants[0].id
}
