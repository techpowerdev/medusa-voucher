import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createLocationFulfillmentSetWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  getOrderDetailWorkflow,
} from "@medusajs/medusa/core-flows"

// A shipping option of the manual provider at a new stock location, as a store sets up for
// Vouchers. Returns its id.
export async function createVoucherShippingOption(container: MedusaContainer, name = "Email delivery") {
  const {
    result: [location],
  } = await createStockLocationsWorkflow(container).run({
    input: { locations: [{ name: `${name} location` }] },
  })
  await container.resolve(ContainerRegistrationKeys.LINK).create({
    [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  })
  await createLocationFulfillmentSetWorkflow(container).run({
    input: { location_id: location.id, fulfillment_set_data: { name: `${name} set`, type: "shipping" } },
  })
  const { data: locations } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "stock_location",
    fields: ["fulfillment_sets.id"],
    filters: { id: location.id },
  })
  const fulfillmentSetId = locations[0].fulfillment_sets![0]!.id
  const serviceZone = await container.resolve(Modules.FULFILLMENT).createServiceZones({
    name: `${name} zone`,
    fulfillment_set_id: fulfillmentSetId,
    geo_zones: [{ type: "country", country_code: "th" }],
  })
  const {
    result: [profile],
  } = await createShippingProfilesWorkflow(container).run({
    input: { data: [{ name: `${name} profile`, type: "default" }] },
  })
  const {
    result: [option],
  } = await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name,
        service_zone_id: serviceZone.id,
        shipping_profile_id: profile.id,
        provider_id: "manual_manual",
        price_type: "flat",
        type: { label: name, description: name, code: "voucher-email" },
        prices: [{ currency_code: "thb", amount: 0 }],
      },
    ],
  })

  return option.id
}

// What Medusa reports about an order's fulfillment: its status, each line's fulfilled and
// delivered quantities, and its fulfillments.
export async function orderFulfillment(container: MedusaContainer, orderId: string) {
  const { result } = await getOrderDetailWorkflow(container).run({
    input: {
      order_id: orderId,
      fields: [
        "id",
        "fulfillment_status",
        // Medusa computes the status from each line's raw quantities, as the admin reads them.
        "items.*",
        "items.detail.*",
        "fulfillments.id",
        "fulfillments.delivered_at",
      ],
    },
  })

  return {
    status: result.fulfillment_status,
    lines: Object.fromEntries(
      (result.items ?? []).map((item) => [
        item.id,
        {
          fulfilled: Number(item.detail?.fulfilled_quantity ?? 0),
          delivered: Number(item.detail?.delivered_quantity ?? 0),
        },
      ])
    ),
    fulfillments: (result.fulfillments ?? []).map((fulfillment) => ({
      id: fulfillment.id,
      delivered: !!fulfillment.delivered_at,
    })),
  }
}
