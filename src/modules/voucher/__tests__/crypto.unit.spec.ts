import validateOptionsLoader from "../loaders/validate-options"
import {
  codeHint,
  createVoucherCrypto,
  normalizeCode,
} from "../utils/crypto"

const KEY = "Xk3vQ9mZ2tLw7RfB5nYc8HdJ1sGpA4uE"
const OTHER_KEY = "Pq6Wd0aN8zVx2MbT5yKc9LfH3rJgE7sU"

describe("voucher crypto", () => {
  it("rejects a missing or short encryption key", () => {
    expect(() => createVoucherCrypto(undefined as unknown as string)).toThrow(
      /encryptionKey/
    )
    expect(() => createVoucherCrypto("too-short")).toThrow(/at least 32/)
  })

  it("rejects a long but predictable encryption key", () => {
    expect(() => createVoucherCrypto("k".repeat(40))).toThrow(/too predictable/)
    expect(() => createVoucherCrypto("1234".repeat(10))).toThrow(
      /too predictable/
    )
  })

  it("accepts random hex and base64 keys", () => {
    expect(() =>
      createVoucherCrypto("9f86d081884c7d659a2feaa0c55ad015")
    ).not.toThrow()
    expect(() =>
      createVoucherCrypto("q3Zl0yN7bV1o8xQ2m5Jt9WcH4rKd6EaS+u/Y7g8Ahz0=")
    ).not.toThrow()
  })

  it("encrypts and decrypts a secret", () => {
    const crypto = createVoucherCrypto(KEY)
    const payload = crypto.encrypt("ABCD-1234-EFGH")

    expect(payload).not.toContain("ABCD")
    expect(payload.startsWith("v1.")).toBe(true)
    expect(crypto.decrypt(payload)).toBe("ABCD-1234-EFGH")
  })

  it("produces a different payload every time for the same secret", () => {
    const crypto = createVoucherCrypto(KEY)

    expect(crypto.encrypt("same")).not.toBe(crypto.encrypt("same"))
  })

  it("keeps non-ASCII secrets intact", () => {
    const crypto = createVoucherCrypto(KEY)

    expect(crypto.decrypt(crypto.encrypt("รหัส-ทดสอบ"))).toBe("รหัส-ทดสอบ")
  })

  it("cannot decrypt with another key", () => {
    const payload = createVoucherCrypto(KEY).encrypt("secret")

    expect(() => createVoucherCrypto(OTHER_KEY).decrypt(payload)).toThrow(
      /could not be decrypted/
    )
  })

  it("detects tampering and unknown formats", () => {
    const crypto = createVoucherCrypto(KEY)
    const [version, iv, tag, ciphertext] = crypto.encrypt("secret").split(".")
    const flipped = ciphertext.startsWith("A") ? `B${ciphertext.slice(1)}` : `A${ciphertext.slice(1)}`

    expect(() => crypto.decrypt([version, iv, tag, flipped].join("."))).toThrow(
      /could not be decrypted/
    )
    expect(() => crypto.decrypt("v2.a.b.c")).toThrow(/unknown format/)
    expect(() => crypto.decrypt("garbage")).toThrow(/unknown format/)
  })

  it("hashes the same code to the same value and different codes apart", () => {
    const crypto = createVoucherCrypto(KEY)

    expect(crypto.hash("ABC-123")).toBe(crypto.hash("  ABC-123 \n"))
    expect(crypto.hash("ABC-123")).not.toBe(crypto.hash("abc-123"))
    expect(crypto.hash("ABC-123")).toMatch(/^[0-9a-f]{64}$/)
  })

  it("hashes with a key so the code cannot be recovered without it", () => {
    expect(createVoucherCrypto(KEY).hash("ABC-123")).not.toBe(
      createVoucherCrypto(OTHER_KEY).hash("ABC-123")
    )
  })

  it("reveals only the end of long codes in the hint", () => {
    expect(normalizeCode("  X1  ")).toBe("X1")
    expect(codeHint("ABCD-1234-EFGH")).toBe("EFGH")
    expect(codeHint("ABCDEFGH")).toBe("GH")
    expect(codeHint("ABC")).toBe("")
  })
})

describe("voucher options loader", () => {
  const run = (options?: Record<string, unknown>) =>
    validateOptionsLoader({ container: {} as never, options } as never)

  it("fails when the encryption key is missing or too short", async () => {
    await expect(run()).rejects.toThrow(/encryptionKey/)
    await expect(run({ encryptionKey: "short" })).rejects.toThrow(/at least 32/)
  })

  it("fails on an unknown time zone and accepts a known one", async () => {
    await expect(run({ encryptionKey: KEY, timezone: "Mars/Olympus" })).rejects.toThrow(/timezone/)
    await expect(run({ encryptionKey: KEY, timezone: "UTC" })).resolves.toBeUndefined()
  })

  it("fails on a minimum remaining validity that is not a whole number of days", async () => {
    for (const bad of [-1, 1.5, "7"]) {
      await expect(run({ encryptionKey: KEY, minimumRemainingValidityDays: bad })).rejects.toThrow(
        /minimumRemainingValidityDays/
      )
    }
    await expect(run({ encryptionKey: KEY, minimumRemainingValidityDays: 30 })).resolves.toBeUndefined()
  })

  it("fails on a delivery.automatic that is not a boolean", async () => {
    for (const bad of ["false", 0, null]) {
      await expect(run({ encryptionKey: KEY, delivery: { automatic: bad } })).rejects.toThrow(
        /delivery\.automatic/
      )
    }
    await expect(run({ encryptionKey: KEY, delivery: { automatic: false } })).resolves.toBeUndefined()
    await expect(run({ encryptionKey: KEY, delivery: { automatic: true } })).resolves.toBeUndefined()
  })

  it("passes with a valid key", async () => {
    await expect(run({ encryptionKey: KEY })).resolves.toBeUndefined()
  })
})
