"use client"

type SignInResult = {
  redirect?: boolean
  url?: string
}

async function postAuth<T>(path: string, body?: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    ...(body
      ? {
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        }
      : {}),
  })

  if (!response.ok) {
    throw new Error(`Auth request failed with status ${response.status}`)
  }

  const text = await response.text()

  if (!text) {
    return undefined as T
  }

  return JSON.parse(text) as T
}

export async function signInWithGoogle() {
  const result = await postAuth<SignInResult>("/api/auth/sign-in/social", {
    provider: "google",
    callbackURL: "/onboarding",
    errorCallbackURL: "/sign-in?error=access_denied",
    scopes: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
  })

  if (result.url) {
    window.location.href = result.url
  }
}

export async function signOut() {
  await postAuth("/api/auth/sign-out", {})
}
