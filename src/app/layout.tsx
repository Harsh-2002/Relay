import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { siteConfig } from "@/lib/metadata";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: "Relay — Telegram bot for AI coding agents",
    template: "%s | Relay",
  },
  description:
    "Control AI coding agents from Telegram via OpenCode. 75+ AI providers, streaming responses, voice input, session management, and 30+ commands.",
  keywords: [
    "Telegram bot",
    "AI coding agent",
    "OpenCode",
    "developer tools",
    "coding assistant",
    "Telegram",
    "open source",
    "Anthropic",
    "OpenAI",
    "Google",
  ],
  authors: [{ name: "Harsh-2002", url: siteConfig.github }],
  creator: "Harsh-2002",
  openGraph: {
    title: "Relay — Telegram bot for AI coding agents",
    description:
      "Control AI coding agents from Telegram via OpenCode. 75+ AI providers, streaming responses, voice input, session management, and 30+ commands.",
    url: siteConfig.url,
    siteName: "Relay",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Relay — Telegram bot for AI coding agents",
    description:
      "Control AI coding agents from Telegram via OpenCode. 75+ AI providers.",
  },
  robots: { index: true, follow: true },
  alternates: {
    canonical: siteConfig.url,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Relay",
  description: siteConfig.description,
  url: siteConfig.url,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Cross-platform",
  license: `${siteConfig.github}/blob/main/LICENSE`,
  isAccessibleForFree: true,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  codeRepository: siteConfig.github,
  programmingLanguage: "TypeScript",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="dns-prefetch" href="https://github.com" />
        <link rel="preconnect" href="https://github.com" crossOrigin="anonymous" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased bg-bg-primary text-text-primary`}
      >
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
