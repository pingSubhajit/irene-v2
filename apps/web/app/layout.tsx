import type { Metadata, Viewport } from "next"
import { Manrope } from "next/font/google"
import localFont from "next/font/local"

import "@workspace/ui/globals.css"
import { cn } from "@workspace/ui/lib/utils"

import { ThemeProvider } from "@/components/theme-provider"
import { rootMetadata } from "@/lib/metadata"

const fontSans = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontDisplay = localFont({
  src: "../../../packages/ui/src/fonts/cirka/Cirka-Variable.ttf",
  display: "swap",
  variable: "--font-display",
})

export const metadata: Metadata = rootMetadata
export const viewport: Viewport = {
  themeColor: "#0c0c0e",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "dark antialiased",
        fontSans.variable,
        fontDisplay.variable
      )}
    >
      <body className="bg-background font-sans text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
