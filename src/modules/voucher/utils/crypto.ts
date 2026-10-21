import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto"
import { MedusaError } from "@medusajs/framework/utils"

export const MIN_ENCRYPTION_KEY_LENGTH = 32
export const MIN_ENCRYPTION_KEY_DISTINCT_CHARACTERS = 10

const FORMAT_VERSION = "v1"
const IV_BYTES = 12
const KEY_BYTES = 32

export type VoucherCrypto = {
  encrypt(plain: string): string
  decrypt(payload: string): string
  hash(code: string): string
}

export function assertValidEncryptionKey(
  key: unknown
): asserts key is string {
  if (typeof key !== "string" || key.length < MIN_ENCRYPTION_KEY_LENGTH) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `The voucher module option "encryptionKey" is required and must be at least ${MIN_ENCRYPTION_KEY_LENGTH} characters long. Generate one with: openssl rand -base64 32`
    )
  }

  // A cheap guard against keys like "aaaa..." or "1234123412...". It is not an entropy
  // measurement: random hex or base64 keys always pass it with a wide margin.
  if (new Set(key).size < MIN_ENCRYPTION_KEY_DISTINCT_CHARACTERS) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `The voucher module option "encryptionKey" is too predictable: it must use at least ${MIN_ENCRYPTION_KEY_DISTINCT_CHARACTERS} different characters. Generate one with: openssl rand -base64 32`
    )
  }
}

// Codes are compared and hashed exactly as the partner issued them, minus surrounding
// whitespace, which spreadsheets and CSV files often add.
export function normalizeCode(code: string): string {
  return code.trim()
}

// The last characters of a code, shown masked in the admin. Short codes reveal less so
// that the hint never gives away a meaningful part of the secret.
export function codeHint(code: string): string {
  const normalized = normalizeCode(code)

  if (normalized.length >= 12) {
    return normalized.slice(-4)
  }

  if (normalized.length >= 6) {
    return normalized.slice(-2)
  }

  return ""
}

const encode = (buffer: Buffer) => buffer.toString("base64url")
const decode = (value: string) => Buffer.from(value, "base64url")

function deriveKey(masterKey: string, purpose: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", masterKey, "medusa-voucher", purpose, KEY_BYTES)
  )
}

export function createVoucherCrypto(masterKey: string): VoucherCrypto {
  assertValidEncryptionKey(masterKey)

  const encryptionKey = deriveKey(masterKey, "voucher-encryption")
  const hashKey = deriveKey(masterKey, "voucher-hash")

  return {
    // AES-256-GCM: `v1.<iv>.<auth tag>.<ciphertext>` (base64url). The version prefix
    // leaves room for key rotation later.
    encrypt(plain) {
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv)
      const ciphertext = Buffer.concat([
        cipher.update(plain, "utf8"),
        cipher.final(),
      ])

      return [
        FORMAT_VERSION,
        encode(iv),
        encode(cipher.getAuthTag()),
        encode(ciphertext),
      ].join(".")
    },

    decrypt(payload) {
      const [version, iv, tag, ciphertext] = payload.split(".")

      if (version !== FORMAT_VERSION || !iv || !tag || !ciphertext) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "The stored voucher secret has an unknown format"
        )
      }

      try {
        const decipher = createDecipheriv("aes-256-gcm", encryptionKey, decode(iv))
        decipher.setAuthTag(decode(tag))

        return Buffer.concat([
          decipher.update(decode(ciphertext)),
          decipher.final(),
        ]).toString("utf8")
      } catch {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "The stored voucher secret could not be decrypted. Check that the encryptionKey option is the one used when it was stored."
        )
      }
    },

    hash(code) {
      return createHmac("sha256", hashKey)
        .update(normalizeCode(code))
        .digest("hex")
    },
  }
}
