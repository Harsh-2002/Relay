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
    default: "Relay — Your personal AI agent, powered by Telegram",
    template: "%s | Relay",
  },
  description:
    "Your personal AI agent — powered by Telegram. Browse the web, automate tasks, write code, and speak your language. Open-source with 75+ AI providers.",
  keywords: [
    "Telegram bot",
    "AI agent",
    "personal AI assistant",
    "OpenCode",
    "task automation",
    "voice assistant",
    "AI coding agent",
    "Telegram",
    "open source",
    "MCP tools",
    "Anthropic",
    "OpenAI",
    "Google",
  ],
  authors: [{ name: "Harsh-2002", url: siteConfig.github }],
  creator: "Harsh-2002",
  openGraph: {
    title: "Relay — Your personal AI agent, powered by Telegram",
    description:
      "Your personal AI agent — powered by Telegram. Browse the web, automate tasks, write code, and speak your language. Open-source with 75+ AI providers.",
    url: siteConfig.url,
    siteName: "Relay",
    type: "website",
    locale: "en_US",
    images: [{ url: "/Relay/relay.png", width: 1200, height: 630, alt: "Relay — Your personal AI agent, powered by Telegram" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Relay — Your personal AI agent, powered by Telegram",
    description:
      "Your personal AI agent — powered by Telegram. 75+ AI providers, voice input, web browsing, task automation, and more.",
    images: ["/Relay/relay.png"],
  },
  icons: {
    icon: [
      { url: "/Relay/favicon.svg", type: "image/svg+xml" },
      { url: "/Relay/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/Relay/apple-touch-icon.png",
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
  applicationCategory: "UtilitiesApplication",
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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[60] focus:px-4 focus:py-2 focus:bg-accent focus:text-black focus:rounded-lg focus:text-sm focus:font-medium"
        >
          Skip to main content
        </a>
        <Nav />
        <main id="main-content">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
