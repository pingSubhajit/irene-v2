import { NextResponse } from "next/server"

import { checkDatabaseHealth } from "@workspace/db"
import { getEnvSanityChecks } from "@workspace/config/server"
import { checkAiGatewayHealth } from "@workspace/ai"
import { checkGoogleCloudStorageHealth } from "@workspace/integrations"
import {
  checkRedisHealth,
  getAiExtractionQueueStats,
  getDocumentNormalizationQueueStats,
} from "@workspace/workflows"

export const runtime = "nodejs"

export async function GET() {
  const envChecks = getEnvSanityChecks()
  const [database, redis, storage, aiGateway, normalizationQueue, extractionQueue] =
    await Promise.allSettled([
    checkDatabaseHealth(),
    checkRedisHealth(),
    checkGoogleCloudStorageHealth(),
    checkAiGatewayHealth(),
    getDocumentNormalizationQueueStats(),
    getAiExtractionQueueStats(),
  ])

  const databaseReady = database.status === "fulfilled" && database.value.ok
  const redisReady = redis.status === "fulfilled" && redis.value.ok
  const storageReady = storage.status === "fulfilled" && storage.value.ok
  const aiReady = aiGateway.status === "fulfilled" && aiGateway.value.ok
  const ready = databaseReady && redisReady && storageReady && aiReady

  return NextResponse.json(
    {
      ok: ready,
      checks: {
        gmailOAuthConfigured: envChecks.auth,
        database: databaseReady,
        redis: redisReady,
        storage: storageReady,
        aiGateway: aiReady,
        queues: {
          documentNormalization:
            normalizationQueue.status === "fulfilled" ? normalizationQueue.value : null,
          aiExtraction:
            extractionQueue.status === "fulfilled" ? extractionQueue.value : null,
        },
      },
    },
    {
      status: ready ? 200 : 503,
    },
  )
}
