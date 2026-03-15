"use client"

type SignInResult = {
  redirect?: boolean
  url?: string
}

async function postAuth<T>(path: string, body?: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    throw new Error(`Auth request failed with status ${response.status}`)
  }

  return (await response.json()) as T
}

export async function signInWithGoogle() {
  const result = await postAuth<SignInResult>("/api/auth/sign-in/social", {
    provider: "google",
    callbackURL: "/dashboard",
    errorCallbackURL: "/sign-in?error=access_denied",
  })

  if (result.url) {
    window.location.href = result.url
  }
}

export async function signOut() {
  await postAuth("/api/auth/sign-out")
}
