import { AppShell } from "@/components/app-shell"
import { requireSession } from "@/lib/session"

export default async function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await requireSession()

  return <AppShell email={session.user.email}>{children}</AppShell>
}
