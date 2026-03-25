import { getFeatureFlagsEnv } from "@workspace/config"

export function getServerFeatureFlags() {
  const env = getFeatureFlagsEnv()

  return {
    adviceEnabled: env.ENABLE_ADVICE,
    memoryLearningEnabled: env.ENABLE_MEMORY_LEARNING,
  }
}

export function isAdviceEnabled() {
  return getServerFeatureFlags().adviceEnabled
}

export function isMemoryLearningEnabled() {
  return getServerFeatureFlags().memoryLearningEnabled
}
