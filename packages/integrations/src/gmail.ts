import { createHash } from "node:crypto"

import { google, type gmail_v1 } from "googleapis"

import { getAuthEnv } from "@workspace/config/server"

import { decryptSecret } from "./crypto"

const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
] as const

const GMAIL_CALLBACK_PATH = "/api/integrations/email/google/callback"
const GMAIL_USER_ID = "me"
const METADATA_HEADERS = ["Date", "From", "To", "Subject"]

type GmailConnectionAuth = {
  accessTokenEncrypted: string
  refreshTokenEncrypted: string | null
  tokenExpiresAt: Date | null
}

export type GmailMessageMetadata = {
  id: string
  threadId: string | null
  historyId: string | null
  internalDate: Date | null
  snippet: string | null
  labelIds: string[]
  subject: string | null
  fromAddress: string | null
  toAddress: string | null
  attachmentNames: string[]
}

export type GmailAttachmentBlob = {
  attachmentId: string
  filename: string
  mimeType: string
  sizeBytes: number
  inline: boolean
}

export type GmailNormalizedMessage = {
  providerMessageId: string
  threadId: string | null
  historyId: string | null
  messageTimestamp: Date
  fromAddress: string | null
  toAddress: string | null
  subject: string | null
  snippet: string | null
  bodyText: string | null
  bodyHtml: string | null
  hasAttachments: boolean
  attachments: GmailAttachmentBlob[]
  documentHash: string
}

type GmailTokenUpdate = {
  accessToken?: string | null
  refreshToken?: string | null
  expiryDate?: Date | null
  scope?: string | null
}

function getOAuthClient() {
  const env = getAuthEnv()

  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    new URL(GMAIL_CALLBACK_PATH, env.BETTER_AUTH_URL).toString(),
  )
}

export function getGmailScopes() {
  return [...GMAIL_SCOPES]
}

export function createGmailConnectUrl(input: { state: string; loginHint: string }) {
  return getOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: [...GMAIL_SCOPES],
    login_hint: input.loginHint,
    state: input.state,
  })
}

export async function exchangeGmailCodeForTokens(code: string) {
  const client = getOAuthClient()
  const { tokens } = await client.getToken(code)

  return {
    accessToken: tokens.access_token ?? null,
    refreshToken: tokens.refresh_token ?? null,
    expiryDate:
      typeof tokens.expiry_date === "number" ? new Date(tokens.expiry_date) : null,
    scope: tokens.scope ?? null,
  }
}

export async function getGoogleIdentityFromTokens(input: {
  accessToken: string
  refreshToken?: string | null
  expiryDate?: Date | null
}) {
  const client = getOAuthClient()
  client.setCredentials({
    access_token: input.accessToken,
    refresh_token: input.refreshToken ?? undefined,
    expiry_date: input.expiryDate?.getTime(),
  })

  const oauth2 = google.oauth2({
    version: "v2",
    auth: client,
  })

  const { data } = await oauth2.userinfo.get()

  return {
    email: data.email?.toLowerCase() ?? null,
    verifiedEmail: Boolean(data.verified_email),
  }
}

async function createAuthorizedGmail(
  connection: GmailConnectionAuth,
  onTokenUpdate?: (tokenUpdate: GmailTokenUpdate) => Promise<void> | void,
) {
  const client = getOAuthClient()
  client.setCredentials({
    access_token: decryptSecret(connection.accessTokenEncrypted),
    refresh_token: connection.refreshTokenEncrypted
      ? decryptSecret(connection.refreshTokenEncrypted)
      : undefined,
    expiry_date: connection.tokenExpiresAt?.getTime(),
  })

  if (onTokenUpdate) {
    client.on("tokens", async (tokens) => {
      await onTokenUpdate({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate:
          typeof tokens.expiry_date === "number" ? new Date(tokens.expiry_date) : null,
        scope: tokens.scope ?? null,
      })
    })
  }

  return {
    gmail: google.gmail({
      version: "v1",
      auth: client,
    }),
    auth: client,
  }
}

function getHeaderValue(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
) {
  return (
    headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ??
    null
  )
}

function decodeBodyData(data: string | null | undefined) {
  if (!data) {
    return null
  }

  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8",
  )
}

function walkParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  state: {
    text: string[]
    html: string[]
    attachments: GmailAttachmentBlob[]
  },
) {
  if (!part) {
    return
  }

  if (part.mimeType === "text/plain" && part.body?.data) {
    state.text.push(decodeBodyData(part.body.data) ?? "")
  }

  if (part.mimeType === "text/html" && part.body?.data) {
    state.html.push(decodeBodyData(part.body.data) ?? "")
  }

  if (part.body?.attachmentId && part.filename) {
    state.attachments.push({
      attachmentId: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      sizeBytes: part.body.size ?? 0,
      inline: Boolean(part.headers?.some((header) => header.name === "Content-ID")),
    })
  }

  for (const child of part.parts ?? []) {
    walkParts(child, state)
  }
}

function buildNormalizedDocumentHash(input: {
  providerMessageId: string
  subject: string | null
  fromAddress: string | null
  toAddress: string | null
  snippet: string | null
  bodyText: string | null
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        providerMessageId: input.providerMessageId,
        subject: input.subject ?? "",
        fromAddress: input.fromAddress ?? "",
        toAddress: input.toAddress ?? "",
        snippet: input.snippet ?? "",
        bodyText: input.bodyText ?? "",
      }),
    )
    .digest("hex")
}

export function buildFinanceSearchQuery(windowDays: number) {
  return `newer_than:${windowDays}d (receipt OR invoice OR payment OR paid OR statement OR bank OR card OR debit OR credit OR transaction OR UPI OR emi OR subscription OR salary OR payroll OR refunded OR refund OR utility)`
}

export async function listGmailMessageIds(
  connection: GmailConnectionAuth,
  input: {
    query: string
    pageToken?: string
    maxResults?: number
  },
  onTokenUpdate?: (tokenUpdate: GmailTokenUpdate) => Promise<void> | void,
) {
  const { gmail } = await createAuthorizedGmail(connection, onTokenUpdate)
  const { data } = await gmail.users.messages.list({
    userId: GMAIL_USER_ID,
    q: input.query,
    pageToken: input.pageToken,
    maxResults: input.maxResults ?? 50,
  })

  return {
    nextPageToken: data.nextPageToken ?? null,
    historyId: data.resultSizeEstimate ? undefined : undefined,
    messages:
      data.messages?.map((message) => ({
        id: message.id ?? "",
        threadId: message.threadId ?? null,
      })) ?? [],
  }
}

export async function listGmailHistory(
  connection: GmailConnectionAuth,
  input: {
    startHistoryId: string
    pageToken?: string
  },
  onTokenUpdate?: (tokenUpdate: GmailTokenUpdate) => Promise<void> | void,
) {
  const { gmail } = await createAuthorizedGmail(connection, onTokenUpdate)
  const { data } = await gmail.users.history.list({
    userId: GMAIL_USER_ID,
    startHistoryId: input.startHistoryId,
    pageToken: input.pageToken,
    historyTypes: ["messageAdded"],
  })

  return {
    nextPageToken: data.nextPageToken ?? null,
    historyId: data.historyId ?? null,
    messages: (data.history ?? [])
      .flatMap((entry) => entry.messagesAdded ?? [])
      .map((item) => ({
        id: item.message?.id ?? "",
        threadId: item.message?.threadId ?? null,
      }))
      .filter((item) => item.id),
  }
}

export async function getGmailMessageMetadata(
  connection: GmailConnectionAuth,
  messageId: string,
  onTokenUpdate?: (tokenUpdate: GmailTokenUpdate) => Promise<void> | void,
) {
  const { gmail } = await createAuthorizedGmail(connection, onTokenUpdate)
  const { data } = await gmail.users.messages.get({
    userId: GMAIL_USER_ID,
    id: messageId,
    format: "metadata",
    metadataHeaders: METADATA_HEADERS,
  })

  const attachmentNames =
    data.payload?.parts
      ?.filter((part) => Boolean(part.filename))
      .map((part) => part.filename!)
      .filter(Boolean) ?? []

  return {
    id: data.id ?? messageId,
    threadId: data.threadId ?? null,
    historyId: data.historyId ?? null,
    internalDate: data.internalDate ? new Date(Number(data.internalDate)) : null,
    snippet: data.snippet ?? null,
    labelIds: data.labelIds ?? [],
    subject: getHeaderValue(data.payload?.headers, "subject"),
    fromAddress: getHeaderValue(data.payload?.headers, "from"),
    toAddress: getHeaderValue(data.payload?.headers, "to"),
    attachmentNames,
  } satisfies GmailMessageMetadata
}

export async function getGmailMessage(
  connection: GmailConnectionAuth,
  messageId: string,
  onTokenUpdate?: (tokenUpdate: GmailTokenUpdate) => Promise<void> | void,
) {
  const { gmail } = await createAuthorizedGmail(connection, onTokenUpdate)
  const { data } = await gmail.users.messages.get({
    userId: GMAIL_USER_ID,
    id: messageId,
    format: "full",
  })

  const state = {
    text: [] as string[],
    html: [] as string[],
    attachments: [] as GmailAttachmentBlob[],
  }

  walkParts(data.payload, state)

  const subject = getHeaderValue(data.payload?.headers, "subject")
  const fromAddress = getHeaderValue(data.payload?.headers, "from")
  const toAddress = getHeaderValue(data.payload?.headers, "to")
  const bodyText = state.text.filter(Boolean).join("\n\n").trim() || null
  const bodyHtml = state.html.filter(Boolean).join("\n").trim() || null
  const normalized = {
    providerMessageId: data.id ?? messageId,
    threadId: data.threadId ?? null,
    historyId: data.historyId ?? null,
    messageTimestamp: data.internalDate
      ? new Date(Number(data.internalDate))
      : new Date(),
    fromAddress,
    toAddress,
    subject,
    snippet: data.snippet ?? null,
    bodyText,
    bodyHtml,
    hasAttachments: state.attachments.length > 0,
    attachments: state.attachments.filter((attachment) => !attachment.inline),
    documentHash: buildNormalizedDocumentHash({
      providerMessageId: data.id ?? messageId,
      subject,
      fromAddress,
      toAddress,
      snippet: data.snippet ?? null,
      bodyText,
    }),
  } satisfies GmailNormalizedMessage

  return normalized
}

export async function downloadGmailAttachment(
  connection: GmailConnectionAuth,
  input: {
    messageId: string
    attachmentId: string
  },
  onTokenUpdate?: (tokenUpdate: GmailTokenUpdate) => Promise<void> | void,
) {
  const { gmail } = await createAuthorizedGmail(connection, onTokenUpdate)
  const { data } = await gmail.users.messages.attachments.get({
    userId: GMAIL_USER_ID,
    messageId: input.messageId,
    id: input.attachmentId,
  })

  return Buffer.from(
    (data.data ?? "").replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  )
}
