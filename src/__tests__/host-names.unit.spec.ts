import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { VoucherEvents } from "../modules/voucher/constants"
import * as workflows from "../workflows"

// AGENTS.md rule 17: several @khumkha/medusa-* plugins share one Medusa app, so every name
// the host sees must say `voucher`. Read from the source, since the names are the point.
const SRC = join(__dirname, "..")

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)

    if (statSync(path).isDirectory()) {
      return name === "__tests__" || name === "admin" ? [] : sourceFiles(path)
    }

    return path.endsWith(".ts") ? [path] : []
  })

const directories = (dir: string) =>
  existsSync(dir) ? readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory()) : []

// The first segment after /admin or /store starts with voucher. The one exception is a
// customer's own data, which Medusa keeps under /store/customers/me (and authenticates there):
// those routes start with voucher one level down.
const unprefixedApiPaths = (apiDir: string): string[] =>
  ["admin", "store"].flatMap((scope) =>
    directories(join(apiDir, scope)).flatMap((name) => {
      if (scope === "store" && name === "customers") {
        const customers = join(apiDir, scope, name)

        return directories(customers).flatMap((child) =>
          child === "me"
            ? directories(join(customers, "me"))
                .filter((own) => !own.startsWith("voucher"))
                .map((own) => `/store/customers/me/${own}`)
            : [`/store/customers/${child}`]
        )
      }

      return name.startsWith("voucher") ? [] : [`/${scope}/${name}`]
    })
  )

const namesIn = (pattern: RegExp) =>
  sourceFiles(SRC).flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(pattern)].map((match) => match[1])
  )

describe("names the host sees", () => {
  it("every workflow id says voucher", () => {
    const ids = (Object.values(workflows) as { getName?: unknown }[])
      .filter((value) => typeof value?.getName === "function")
      .map((workflow) => (workflow.getName as () => string)())

    expect(ids.length).toBeGreaterThan(0)
    expect(ids.filter((id) => !id.includes("voucher"))).toEqual([])
  })

  it("every step id says voucher", () => {
    const ids = namesIn(/createStep\(\s*"([^"]+)"/g)

    expect(ids.length).toBeGreaterThan(0)
    expect(ids.filter((id) => !id.includes("voucher"))).toEqual([])
  })

  it("every scheduled job name says voucher", () => {
    const names = sourceFiles(join(SRC, "jobs")).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/name:\s*"([^"]+)"/g)].map((match) => match[1])
    )

    expect(names.length).toBeGreaterThan(0)
    expect(names.filter((name) => !name.includes("voucher"))).toEqual([])
  })

  it("every table starts with voucher", () => {
    const tables = namesIn(/\.define\(\s*"([^"]+)"/g)

    expect(tables.length).toBeGreaterThan(0)
    expect(tables.filter((table) => !table.startsWith("voucher"))).toEqual([])
  })

  it("every admin and store API path starts with voucher", () => {
    expect(unprefixedApiPaths(join(SRC, "api"))).toEqual([])
  })

  describe("the API path check", () => {
    let api: string

    beforeEach(() => {
      api = mkdtempSync(join(tmpdir(), "host-names-"))
    })

    afterEach(() => {
      rmSync(api, { recursive: true, force: true })
    })

    const route = (path: string) => mkdirSync(join(api, path), { recursive: true })

    it("accepts a customer's own routes under /store/customers/me/voucher...", () => {
      route("store/customers/me/vouchers/[id]")
      route("admin/voucher-products")

      expect(unprefixedApiPaths(api)).toEqual([])
    })

    it("refuses any other route, under /store/customers too", () => {
      route("store/customers/me/wishlist")
      route("store/customers/addresses")
      route("store/carts")
      route("admin/orders")

      expect(unprefixedApiPaths(api).sort()).toEqual([
        "/admin/orders",
        "/store/carts",
        "/store/customers/addresses",
        "/store/customers/me/wishlist",
      ])
    })
  })

  it("every event name starts with voucher.", () => {
    const events: string[] = Object.values(VoucherEvents)

    expect(events.length).toBeGreaterThan(0)
    expect(events.filter((event) => !event.startsWith("voucher."))).toEqual([])
  })
})
