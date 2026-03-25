"use client"

import type {
  PwaQueueSummary,
  PwaRouteKey,
  PwaRouteSnapshot,
  PwaUserMeta,
  StoredPwaMutation,
} from "./contracts"
import { PWA_DB_NAME, PWA_DB_VERSION } from "./contracts"

type SnapshotRecord = PwaRouteSnapshot & {
  key: string
}

type MetaValueMap = {
  currentUser: PwaUserMeta | null
  lastSyncAt: string | null
}

type MetaRecord<K extends keyof MetaValueMap = keyof MetaValueMap> = {
  key: K
  value: MetaValueMap[K]
}

const SNAPSHOTS_STORE = "snapshots"
const MUTATIONS_STORE = "mutations"
const META_STORE = "meta"

function openPwaDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(PWA_DB_NAME, PWA_DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
        db.createObjectStore(SNAPSHOTS_STORE, { keyPath: "key" })
      }

      if (!db.objectStoreNames.contains(MUTATIONS_STORE)) {
        db.createObjectStore(MUTATIONS_STORE, { keyPath: "mutationId" })
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open IndexedDB"))
  })
}

function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T> | void
) {
  return openPwaDb().then(
    (db) =>
      new Promise<T | void>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode)
        const store = transaction.objectStore(storeName)
        const request = action(store)

        transaction.oncomplete = () => {
          db.close()
        }
        transaction.onerror = () => {
          reject(transaction.error ?? new Error("IndexedDB transaction failed"))
          db.close()
        }

        if (!request) {
          resolve()
          return
        }

        request.onsuccess = () => resolve(request.result)
        request.onerror = () =>
          reject(request.error ?? new Error("IndexedDB request failed"))
      })
  )
}

export function buildSnapshotKey(userId: string, routeKey: PwaRouteKey) {
  return `${userId}:${routeKey}`
}

export async function saveRouteSnapshot(snapshot: PwaRouteSnapshot) {
  const record: SnapshotRecord = {
    ...snapshot,
    key: buildSnapshotKey(snapshot.userId, snapshot.routeKey),
  }

  await withStore(SNAPSHOTS_STORE, "readwrite", (store) => store.put(record))
}

export async function loadRouteSnapshot<K extends PwaRouteKey>(input: {
  userId: string
  routeKey: K
}) {
  const record = (await withStore<SnapshotRecord>(
    SNAPSHOTS_STORE,
    "readonly",
    (store) => store.get(buildSnapshotKey(input.userId, input.routeKey))
  )) as SnapshotRecord | undefined

  return (record as PwaRouteSnapshot<K> | undefined) ?? null
}

export async function listRouteSnapshotsForUser(userId: string) {
  const records = ((await withStore<SnapshotRecord[]>(
    SNAPSHOTS_STORE,
    "readonly",
    (store) => store.getAll()
  )) ?? []) as SnapshotRecord[]

  return records.filter((record) => record.userId === userId)
}

export async function putStoredMutation(mutation: StoredPwaMutation) {
  await withStore(MUTATIONS_STORE, "readwrite", (store) => store.put(mutation))
}

export async function getStoredMutation(mutationId: string) {
  const record = (await withStore<StoredPwaMutation>(
    MUTATIONS_STORE,
    "readonly",
    (store) => store.get(mutationId)
  )) as StoredPwaMutation | undefined

  return record ?? null
}

export async function listStoredMutationsForUser(userId: string) {
  const records = ((await withStore<StoredPwaMutation[]>(
    MUTATIONS_STORE,
    "readonly",
    (store) => store.getAll()
  )) ?? []) as StoredPwaMutation[]

  return records
    .filter((record) => record.userId === userId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function updateStoredMutation(
  mutationId: string,
  patch: Partial<StoredPwaMutation>
) {
  const existing = await getStoredMutation(mutationId)
  if (!existing) {
    return null
  }

  const nextValue = {
    ...existing,
    ...patch,
  } satisfies StoredPwaMutation

  await putStoredMutation(nextValue)
  return nextValue
}

export async function removeStoredMutation(mutationId: string) {
  await withStore(MUTATIONS_STORE, "readwrite", (store) =>
    store.delete(mutationId)
  )
}

async function setMeta<K extends keyof MetaValueMap>(
  key: K,
  value: MetaValueMap[K]
) {
  const record: MetaRecord<K> = { key, value }
  await withStore(META_STORE, "readwrite", (store) => store.put(record))
}

async function getMeta<K extends keyof MetaValueMap>(key: K) {
  const record = (await withStore<MetaRecord<K>>(
    META_STORE,
    "readonly",
    (store) => store.get(key)
  )) as MetaRecord<K> | undefined

  return record?.value ?? null
}

export function setCurrentUserMeta(user: PwaUserMeta | null) {
  return setMeta("currentUser", user)
}

export function getCurrentUserMeta() {
  return getMeta("currentUser")
}

export function setLastSyncAt(value: string | null) {
  return setMeta("lastSyncAt", value)
}

export function getLastSyncAt() {
  return getMeta("lastSyncAt")
}

export async function getPwaQueueSummary(
  userId: string
): Promise<PwaQueueSummary> {
  const mutations = await listStoredMutationsForUser(userId)

  return mutations.reduce<PwaQueueSummary>(
    (summary, mutation) => {
      if (mutation.status === "pending") summary.pendingCount += 1
      if (mutation.status === "replaying") summary.replayingCount += 1
      if (mutation.status === "blocked_auth") summary.blockedCount += 1
      if (
        mutation.status === "failed_retryable" ||
        mutation.status === "failed_terminal"
      ) {
        summary.failedCount += 1
      }
      return summary
    },
    {
      pendingCount: 0,
      replayingCount: 0,
      failedCount: 0,
      blockedCount: 0,
    }
  )
}

export async function clearPwaStateForUser(userId: string) {
  const [snapshots, mutations] = await Promise.all([
    listRouteSnapshotsForUser(userId),
    listStoredMutationsForUser(userId),
  ])

  await Promise.all([
    ...snapshots.map((snapshot) =>
      withStore(SNAPSHOTS_STORE, "readwrite", (store) =>
        store.delete(buildSnapshotKey(snapshot.userId, snapshot.routeKey))
      )
    ),
    ...mutations.map((mutation) => removeStoredMutation(mutation.mutationId)),
  ])
}

export async function clearAllPwaState() {
  await Promise.all([
    withStore(SNAPSHOTS_STORE, "readwrite", (store) => store.clear()),
    withStore(MUTATIONS_STORE, "readwrite", (store) => store.clear()),
    withStore(META_STORE, "readwrite", (store) => store.clear()),
  ])
}
