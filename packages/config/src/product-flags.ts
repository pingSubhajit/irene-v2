export const productFeatureFlags = {
  gmailInitialBackfillEnabled: false,
} as const

export function isGmailInitialBackfillEnabled() {
  return productFeatureFlags.gmailInitialBackfillEnabled
}
