import { Storage } from "@google-cloud/storage"

import { getStorageEnv } from "@workspace/config/server"

const globalForStorage = globalThis as typeof globalThis & {
  __ireneStorage?: Storage
}

function getStorageClient() {
  if (globalForStorage.__ireneStorage) {
    return globalForStorage.__ireneStorage
  }

  const env = getStorageEnv()

  const storage = new Storage({
    projectId: env.GCS_PROJECT_ID,
    credentials: {
      client_email: env.GCS_CLIENT_EMAIL,
      private_key: env.GCS_PRIVATE_KEY,
    },
  })

  if (process.env.NODE_ENV !== "production") {
    globalForStorage.__ireneStorage = storage
  }

  return storage
}

function getBucket() {
  const env = getStorageEnv()
  return getStorageClient().bucket(env.GCS_BUCKET)
}

type UploadPrivateObjectInput = {
  storageKey: string
  body: Buffer | string
  contentType: string
}

export async function uploadPrivateObject(input: UploadPrivateObjectInput) {
  const file = getBucket().file(input.storageKey)

  await file.save(input.body, {
    resumable: false,
    contentType: input.contentType,
    validation: false,
  })

  return {
    storageKey: input.storageKey,
  }
}

export async function deletePrivateObjects(storageKeys: string[]) {
  const uniqueKeys = [...new Set(storageKeys.filter(Boolean))]

  for (const storageKey of uniqueKeys) {
    await getBucket().file(storageKey).delete({
      ignoreNotFound: true,
    })
  }

  return {
    deletedCount: uniqueKeys.length,
  }
}

export async function checkGoogleCloudStorageHealth() {
  await getBucket().getFiles({
    maxResults: 1,
    autoPaginate: false,
  })

  return {
    ok: true,
  }
}
