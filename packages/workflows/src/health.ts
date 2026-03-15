import { getSystemQueue } from "./system"

export async function checkRedisHealth() {
  const client = await getSystemQueue().client
  const result = await client.ping()

  return {
    ok: result === "PONG",
  }
}
