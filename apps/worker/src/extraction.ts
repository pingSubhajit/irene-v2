import { htmlToText } from "html-to-text"
import { PDFParse } from "pdf-parse"

import { downloadPrivateObject } from "@workspace/integrations"
import {
  listAttachmentsForRawDocument,
  updateDocumentAttachmentParseResult,
  updateRawDocumentBodyText,
  type DocumentAttachmentSelect,
  type RawDocumentSelect,
} from "@workspace/db"

export type NormalizedExtractionDocument = {
  rawDocumentId: string
  sender: string | null
  recipient: string | null
  subject: string | null
  snippet: string | null
  messageTimestamp: string
  bodyText: string | null
  attachmentTexts: Array<{
    attachmentId: string
    filename: string
    mimeType: string
    parsedText: string
  }>
  relevanceLabel: string | null
  relevanceStage: string | null
}

export type WorkerExtractedSignal = {
  signalType:
    | "purchase_signal"
    | "income_signal"
    | "subscription_signal"
    | "emi_signal"
    | "bill_signal"
    | "refund_signal"
    | "transfer_signal"
    | "generic_finance_signal"
  candidateEventType:
    | "purchase"
    | "income"
    | "subscription_charge"
    | "emi_payment"
    | "bill_payment"
    | "refund"
    | "transfer"
    | null
  amountMinor: number | null
  currency: string | null
  eventDate: string | null
  merchantRaw: string | null
  merchantHint: string | null
  paymentInstrumentHint: string | null
  categoryHint: string | null
  isRecurringHint: boolean
  isEmiHint: boolean
  confidence: number
  evidenceSnippets: string[]
  explanation: string
}

type DeterministicExtractionResult = {
  parserName: string
  signals: WorkerExtractedSignal[]
}

function normalizeWhitespace(input: string | null | undefined) {
  if (!input) {
    return null
  }

  const normalized = input.replace(/\s+/g, " ").trim()
  return normalized.length > 0 ? normalized : null
}

function isPdfAttachment(attachment: DocumentAttachmentSelect) {
  return (
    attachment.mimeType.toLowerCase().includes("pdf") ||
    attachment.filename.toLowerCase().endsWith(".pdf")
  )
}

function getBodyTextFromHtml(html: string) {
  return normalizeWhitespace(
    htmlToText(html, {
      wordwrap: false,
      selectors: [
        { selector: "img", format: "skip" },
        { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
      ],
    }),
  )
}

function extractSenderName(sender: string | null) {
  const normalized = normalizeWhitespace(sender)

  if (!normalized) {
    return null
  }

  const angleBracketIndex = normalized.indexOf("<")
  if (angleBracketIndex === -1) {
    return normalized
  }

  return normalized.slice(0, angleBracketIndex).replace(/^"+|"+$/g, "").trim() || normalized
}

function pickEvidenceSnippets(...values: Array<string | null | undefined>) {
  const snippets = values
    .map((value) => normalizeWhitespace(value))
    .filter((value): value is string => Boolean(value))

  return [...new Set(snippets)].slice(0, 4)
}

function getCombinedText(document: NormalizedExtractionDocument) {
  return [
    document.subject,
    document.snippet,
    document.bodyText,
    ...document.attachmentTexts.map((attachment) => attachment.parsedText),
  ]
    .filter(Boolean)
    .join("\n")
}

function parseCurrencyAndAmount(text: string) {
  const match = text.match(/(?:₹|Rs\.?|INR|\$|USD)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i)

  if (!match?.[1]) {
    return {
      currency: null,
      amountMinor: null,
    }
  }

  const rawValue = Number.parseFloat(match[1].replace(/,/g, ""))
  if (!Number.isFinite(rawValue)) {
    return {
      currency: null,
      amountMinor: null,
    }
  }

  const currency = /₹|Rs\.?|INR/i.test(match[0]) ? "INR" : "USD"

  return {
    currency,
    amountMinor: Math.round(rawValue * 100),
  }
}

function inferPaymentInstrumentHint(text: string) {
  const cardMatch = text.match(/\b(?:card|acct|account)\s*(?:ending|xx|xxxx)?\s*([0-9]{4})\b/i)
  return cardMatch?.[1] ?? null
}

function inferMerchantHint(document: NormalizedExtractionDocument) {
  return extractSenderName(document.sender)
}

export async function buildNormalizedExtractionDocument(rawDocument: RawDocumentSelect) {
  const attachments = await listAttachmentsForRawDocument(rawDocument.id)
  let bodyText = normalizeWhitespace(rawDocument.bodyText)

  if (!bodyText && rawDocument.bodyHtmlStorageKey) {
    const htmlBuffer = await downloadPrivateObject(rawDocument.bodyHtmlStorageKey)
    bodyText = getBodyTextFromHtml(htmlBuffer.toString("utf8"))

    if (bodyText) {
      await updateRawDocumentBodyText(rawDocument.id, bodyText)
    }
  }

  const attachmentTexts: NormalizedExtractionDocument["attachmentTexts"] = []

  for (const attachment of attachments) {
    if (!isPdfAttachment(attachment)) {
      if (attachment.parseStatus === "pending") {
        await updateDocumentAttachmentParseResult(attachment.id, {
          parseStatus: "skipped",
        })
      }
      continue
    }

    if (attachment.parseStatus === "completed" && attachment.parsedText) {
      attachmentTexts.push({
        attachmentId: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        parsedText: attachment.parsedText,
      })
      continue
    }

    await updateDocumentAttachmentParseResult(attachment.id, {
      parseStatus: "processing",
    })

    try {
      const buffer = await downloadPrivateObject(attachment.storageKey)
      const parser = new PDFParse({ data: buffer })
      const parsed = await parser.getText()
      const parsedText = normalizeWhitespace(parsed.text)
      await parser.destroy()

      await updateDocumentAttachmentParseResult(attachment.id, {
        parseStatus: parsedText ? "completed" : "failed",
        parsedText,
      })

      if (parsedText) {
        attachmentTexts.push({
          attachmentId: attachment.id,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          parsedText,
        })
      }
    } catch {
      await updateDocumentAttachmentParseResult(attachment.id, {
        parseStatus: "failed",
      })
    }
  }

  return {
    rawDocumentId: rawDocument.id,
    sender: rawDocument.fromAddress,
    recipient: rawDocument.toAddress,
    subject: rawDocument.subject,
    snippet: rawDocument.snippet,
    messageTimestamp: rawDocument.messageTimestamp.toISOString(),
    bodyText,
    attachmentTexts,
    relevanceLabel: rawDocument.relevanceLabel ?? null,
    relevanceStage: rawDocument.relevanceStage ?? null,
  } satisfies NormalizedExtractionDocument
}

export function runDeterministicExtraction(
  document: NormalizedExtractionDocument,
): DeterministicExtractionResult | null {
  const combined = getCombinedText(document)
  const lowered = combined.toLowerCase()
  const amount = parseCurrencyAndAmount(combined)
  const senderName = extractSenderName(document.sender)
  const paymentInstrumentHint = inferPaymentInstrumentHint(combined)
  const eventDate = document.messageTimestamp.slice(0, 10)

  if (/\b(salary credited|salary for|payroll|stipend|payout)\b/i.test(lowered)) {
    return {
      parserName: "salary-credit-parser",
      signals: [
        {
          signalType: "income_signal",
          candidateEventType: "income",
          amountMinor: amount.amountMinor,
          currency: amount.currency ?? "INR",
          eventDate,
          merchantRaw: senderName,
          merchantHint: senderName,
          paymentInstrumentHint,
          categoryHint: "income",
          isRecurringHint: true,
          isEmiHint: false,
          confidence: 0.99,
          evidenceSnippets: pickEvidenceSnippets(document.subject, document.snippet, document.bodyText),
          explanation: "Detected salary or payroll credit phrasing.",
        },
      ],
    }
  }

  if (/\b(refund|reversed|reversal|credited back|chargeback)\b/i.test(lowered)) {
    return {
      parserName: "refund-parser",
      signals: [
        {
          signalType: "refund_signal",
          candidateEventType: "refund",
          amountMinor: amount.amountMinor,
          currency: amount.currency ?? "INR",
          eventDate,
          merchantRaw: senderName,
          merchantHint: senderName,
          paymentInstrumentHint,
          categoryHint: null,
          isRecurringHint: false,
          isEmiHint: false,
          confidence: 0.97,
          evidenceSnippets: pickEvidenceSnippets(document.subject, document.snippet, document.bodyText),
          explanation: "Detected refund or reversal wording.",
        },
      ],
    }
  }

  if (
    /\b(transaction (?:alert|notification)|debited|credited|spent|payment received|payment successful)\b/i.test(
      lowered,
    )
  ) {
    const isIncome = /\bcredited\b/i.test(lowered) && !/\brefund|reversal\b/i.test(lowered)

    return {
      parserName: "transaction-alert-parser",
      signals: [
        {
          signalType: isIncome ? "income_signal" : "purchase_signal",
          candidateEventType: isIncome ? "income" : "purchase",
          amountMinor: amount.amountMinor,
          currency: amount.currency ?? "INR",
          eventDate,
          merchantRaw: senderName,
          merchantHint: senderName,
          paymentInstrumentHint,
          categoryHint: isIncome ? "income" : null,
          isRecurringHint: false,
          isEmiHint: false,
          confidence: 0.96,
          evidenceSnippets: pickEvidenceSnippets(document.subject, document.snippet, document.bodyText),
          explanation: "Detected explicit bank transaction alert wording.",
        },
      ],
    }
  }

  if (/\b(uber receipt|google play order receipt|google play)\b/i.test(lowered)) {
    return {
      parserName: "platform-receipt-parser",
      signals: [
        {
          signalType: "purchase_signal",
          candidateEventType: "purchase",
          amountMinor: amount.amountMinor,
          currency: amount.currency ?? "INR",
          eventDate,
          merchantRaw: senderName,
          merchantHint: inferMerchantHint(document),
          paymentInstrumentHint,
          categoryHint: null,
          isRecurringHint: false,
          isEmiHint: false,
          confidence: 0.95,
          evidenceSnippets: pickEvidenceSnippets(document.subject, document.snippet, document.bodyText),
          explanation: "Detected known digital receipt template.",
        },
      ],
    }
  }

  return null
}
