import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

import { getSecurityEnv } from "@workspace/config/server"

const IV_LENGTH = 12

function getEncryptionKey() {
  const env = getSecurityEnv()
  return createHash("sha256").update(env.APP_ENCRYPTION_KEY).digest()
}

export function encryptSecret(value: string) {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`
}

export function decryptSecret(value: string) {
  const [ivPart, authTagPart, dataPart] = value.split(".")

  if (!ivPart || !authTagPart || !dataPart) {
    throw new Error("Invalid encrypted secret format")
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivPart, "base64url"),
  )

  decipher.setAuthTag(Buffer.from(authTagPart, "base64url"))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ])

  return decrypted.toString("utf8")
}
