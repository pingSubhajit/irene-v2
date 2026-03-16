const gatewayProviderPrefix = "google"

const modelCatalog = {
  financeRelevanceClassifier: "gemini-3-flash",
  financeDocumentRouter: "gemini-3-flash",
  financeSignalExtractor: "gemini-3-flash",
} as const

function normalizeGatewayModelId(modelId: string) {
  return modelId.includes("/") ? modelId : `${gatewayProviderPrefix}/${modelId}`
}

export const aiModels = {
  financeRelevanceClassifier: normalizeGatewayModelId(
    modelCatalog.financeRelevanceClassifier,
  ),
  financeDocumentRouter: normalizeGatewayModelId(modelCatalog.financeDocumentRouter),
  financeSignalExtractor: normalizeGatewayModelId(modelCatalog.financeSignalExtractor),
} as const

export type AiModelPurpose = keyof typeof aiModels

export const aiPromptVersions = {
  financeRelevanceClassifier: "finance-relevance-v1",
  financeDocumentRouter: "finance-document-router-v1",
  financeSignalExtractor: "finance-signal-extractor-v1",
} as const
