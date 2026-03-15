const gatewayProviderPrefix = "google"

const modelCatalog = {
  financeRelevanceClassifier: "gemini-3-flash",
} as const

function normalizeGatewayModelId(modelId: string) {
  return modelId.includes("/") ? modelId : `${gatewayProviderPrefix}/${modelId}`
}

export const aiModels = {
  financeRelevanceClassifier: normalizeGatewayModelId(
    modelCatalog.financeRelevanceClassifier,
  ),
} as const

export type AiModelPurpose = keyof typeof aiModels
