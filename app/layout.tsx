import type React from "react"
import { LanguageProvider } from "@/lib/contexts/language-context"
import { inter, jetbrainsMono } from "@/lib/fonts" // Import fonts from the new file
import "./globals.css"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className={inter.className}>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  )
}

export const metadata = {
      generator: 'v0.dev'
    };
