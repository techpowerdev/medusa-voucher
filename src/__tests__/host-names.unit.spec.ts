import { readdirSync, readFileSync, statSync } from "fs"
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
    const paths = ["admin", "store"].flatMap((scope) =>
      readdirSync(join(SRC, "api", scope))
        .filter((name) => statSync(join(SRC, "api", scope, name)).isDirectory())
        .map((name) => `/${scope}/${name}`)
    )

    expect(paths.length).toBeGreaterThan(0)
    expect(paths.filter((path) => !path.split("/")[2].startsWith("voucher"))).toEqual([])
  })

  it("every event name starts with voucher.", () => {
    const events: string[] = Object.values(VoucherEvents)

    expect(events.length).toBeGreaterThan(0)
    expect(events.filter((event) => !event.startsWith("voucher."))).toEqual([])
  })
})
