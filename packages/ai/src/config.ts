const gatewayProviderPrefix = "google"

const modelCatalog = {
  financeRelevanceClassifier: "gemini-3-flash",
  financeDocumentRouter: "gemini-3-flash",
  financeSignalExtractor: "gemini-3-flash",
  financeBalanceExtractor: "gemini-3-flash",
  financeMemoryAuthoring: "gemini-3-flash",
  financeMemorySummarizer: "gemini-3-flash",
  financeInstrumentResolver: "gemini-3-flash",
  financeMerchantResolver: "gemini-3-flash",
  financeCategoryResolver: "gemini-3-flash",
  financeReconciliationResolver: "gemini-3-flash",
  financeAdviceGenerator: "gemini-3-flash",
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
  financeBalanceExtractor: normalizeGatewayModelId(modelCatalog.financeBalanceExtractor),
  financeMemoryAuthoring: normalizeGatewayModelId(modelCatalog.financeMemoryAuthoring),
  financeMemorySummarizer: normalizeGatewayModelId(modelCatalog.financeMemorySummarizer),
  financeInstrumentResolver: normalizeGatewayModelId(modelCatalog.financeInstrumentResolver),
  financeMerchantResolver: normalizeGatewayModelId(modelCatalog.financeMerchantResolver),
  financeCategoryResolver: normalizeGatewayModelId(modelCatalog.financeCategoryResolver),
  financeReconciliationResolver: normalizeGatewayModelId(
    modelCatalog.financeReconciliationResolver,
  ),
  financeAdviceGenerator: normalizeGatewayModelId(modelCatalog.financeAdviceGenerator),
} as const

export type AiModelPurpose = keyof typeof aiModels

export const aiPromptVersions = {
  financeRelevanceClassifier: "finance-relevance-v2",
  financeDocumentRouter: "finance-document-router-v1",
  financeSignalExtractor: "finance-signal-extractor-v2",
  financeBalanceExtractor: "finance-balance-extractor-v1",
  financeMemoryAuthoring: "finance-memory-authoring-v1",
  financeMemorySummarizer: "finance-memory-summarizer-v1",
  financeInstrumentResolver: "finance-instrument-resolver-v1",
  financeMerchantResolver: "finance-merchant-resolver-v1",
  financeCategoryResolver: "finance-category-resolver-v1",
  financeReconciliationResolver: "finance-reconciliation-resolver-v1",
  financeAdviceGenerator: "finance-advice-generator-v1",
} as const
