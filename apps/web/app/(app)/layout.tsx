import { getAuthUserProfile } from "@workspace/db"

import { AppShell } from "@/components/app-shell"
import { requireSession } from "@/lib/session"

export default async function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await requireSession()
  const authUser = await getAuthUserProfile(session.user.id)

  return (
    <AppShell
      user={{
        name: session.user.name,
        image: authUser?.image ?? session.user.image,
      }}
    >
      {children}
    </AppShell>
  )
}
