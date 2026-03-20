import { normalizeMerchantResolutionName } from "@workspace/db"

export type MerchantAliasCandidate = {
  merchantId: string
  merchantDisplayName: string
  merchantNormalizedName: string
  aliasText: string
}

export type ExistingMerchantFastPathResult =
  | {
      status: "matched_existing_merchant"
      reasonCode: "exact_alias_match" | "fuzzy_alias_match"
      merchantId: string
      merchantDisplayName: string
      matchedAliasText: string
      candidateHint: string
      bestScore: number
      runnerUpScore: number | null
    }
  | {
      status: "no_clear_match"
      reasonCode:
        | "missing_candidate_hint"
        | "exact_alias_ambiguous"
        | "fuzzy_score_too_low"
        | "fuzzy_match_ambiguous"
      candidateHint: string | null
      bestScore: number | null
      runnerUpScore: number | null
    }

function tokenize(input: string) {
  return input.split(" ").filter(Boolean)
}

function sharedPrefixLength(left: string, right: string) {
  const max = Math.min(left.length, right.length)
  let index = 0

  while (index < max && left[index] === right[index]) {
    index += 1
  }

  return index
}

function scoreNormalizedAlias(hint: string, alias: string) {
  if (hint === alias) {
    return 1
  }

  const hintTokens = tokenize(hint)
  const aliasTokens = tokenize(alias)

  if (hintTokens.length === 0 || aliasTokens.length === 0) {
    return 0
  }

  const hintTokenSet = new Set(hintTokens)
  const aliasTokenSet = new Set(aliasTokens)
  const overlappingTokens = [...hintTokenSet].filter((token) => aliasTokenSet.has(token))
  const tokenOverlapScore = overlappingTokens.length / Math.max(hintTokenSet.size, aliasTokenSet.size)

  const hintFirstToken = hintTokens[0] ?? ""
  const aliasFirstToken = aliasTokens[0] ?? ""
  const sharedFirstToken =
    hintFirstToken.length >= 4 && hintFirstToken === aliasFirstToken ? 0.25 : 0
  const containsBoost =
    (hint.includes(alias) || alias.includes(hint)) && Math.min(hint.length, alias.length) >= 4
      ? 0.15
      : 0
  const prefixBoost = sharedPrefixLength(hint, alias) >= 4 ? 0.1 : 0

  return Math.min(0.99, tokenOverlapScore * 0.55 + sharedFirstToken + containsBoost + prefixBoost)
}

export function resolveExistingMerchantFastPath(input: {
  merchantHints: Array<string | null | undefined>
  aliasCandidates: MerchantAliasCandidate[]
}): ExistingMerchantFastPathResult {
  const normalizedHints = input.merchantHints
    .map((hint) => normalizeMerchantResolutionName(hint))
    .filter((hint): hint is string => Boolean(hint))

  if (normalizedHints.length === 0) {
    return {
      status: "no_clear_match",
      reasonCode: "missing_candidate_hint",
      candidateHint: null,
      bestScore: null,
      runnerUpScore: null,
    }
  }

  for (const hint of normalizedHints) {
    const exactMatches = new Map<
      string,
      { merchantDisplayName: string; matchedAliasText: string }
    >()

    for (const candidate of input.aliasCandidates) {
      const normalizedAlias = normalizeMerchantResolutionName(candidate.aliasText)

      if (
        normalizedAlias === hint ||
        candidate.merchantNormalizedName === hint
      ) {
        exactMatches.set(candidate.merchantId, {
          merchantDisplayName: candidate.merchantDisplayName,
          matchedAliasText: candidate.aliasText,
        })
      }
    }

    if (exactMatches.size === 1) {
      const [merchantId, match] = exactMatches.entries().next().value as [
        string,
        { merchantDisplayName: string; matchedAliasText: string },
      ]

      return {
        status: "matched_existing_merchant",
        reasonCode: "exact_alias_match",
        merchantId,
        merchantDisplayName: match.merchantDisplayName,
        matchedAliasText: match.matchedAliasText,
        candidateHint: hint,
        bestScore: 1,
        runnerUpScore: null,
      }
    }

    if (exactMatches.size > 1) {
      return {
        status: "no_clear_match",
        reasonCode: "exact_alias_ambiguous",
        candidateHint: hint,
        bestScore: 1,
        runnerUpScore: 1,
      }
    }
  }

  let bestHint: string | null = null
  let bestMerchant:
    | {
        merchantId: string
        merchantDisplayName: string
        matchedAliasText: string
        score: number
      }
    | null = null
  let runnerUpScore: number | null = null

  for (const hint of normalizedHints) {
    const bestScoreByMerchant = new Map<
      string,
      { merchantDisplayName: string; matchedAliasText: string; score: number }
    >()

    for (const candidate of input.aliasCandidates) {
      const normalizedAlias =
        normalizeMerchantResolutionName(candidate.aliasText) ??
        candidate.merchantNormalizedName
      const score = scoreNormalizedAlias(hint, normalizedAlias)
      const existing = bestScoreByMerchant.get(candidate.merchantId)

      if (!existing || score > existing.score) {
        bestScoreByMerchant.set(candidate.merchantId, {
          merchantDisplayName: candidate.merchantDisplayName,
          matchedAliasText: candidate.aliasText,
          score,
        })
      }
    }

    const ranked = [...bestScoreByMerchant.entries()]
      .map(([merchantId, result]) => ({ merchantId, ...result }))
      .sort((left, right) => right.score - left.score)

    const top = ranked[0] ?? null
    const next = ranked[1] ?? null

    if (!top) {
      continue
    }

    if (!bestMerchant || top.score > bestMerchant.score) {
      bestHint = hint
      bestMerchant = top
      runnerUpScore = next?.score ?? null
    }
  }

  if (!bestMerchant || !bestHint) {
    return {
      status: "no_clear_match",
      reasonCode: "fuzzy_score_too_low",
      candidateHint: null,
      bestScore: null,
      runnerUpScore: null,
    }
  }

  if (bestMerchant.score < 0.76) {
    return {
      status: "no_clear_match",
      reasonCode: "fuzzy_score_too_low",
      candidateHint: bestHint,
      bestScore: bestMerchant.score,
      runnerUpScore,
    }
  }

  if (runnerUpScore !== null && bestMerchant.score - runnerUpScore < 0.08) {
    return {
      status: "no_clear_match",
      reasonCode: "fuzzy_match_ambiguous",
      candidateHint: bestHint,
      bestScore: bestMerchant.score,
      runnerUpScore,
    }
  }

  return {
    status: "matched_existing_merchant",
    reasonCode: "fuzzy_alias_match",
    merchantId: bestMerchant.merchantId,
    merchantDisplayName: bestMerchant.merchantDisplayName,
    matchedAliasText: bestMerchant.matchedAliasText,
    candidateHint: bestHint,
    bestScore: bestMerchant.score,
    runnerUpScore,
  }
}
