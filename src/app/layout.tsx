import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Relay \u2014 Telegram bot for AI coding agents",
    template: "%s | Relay",
  },
  description:
    "Control OpenCode, Claude Code, and OpenAI Codex from Telegram. Streaming responses, voice input, session management, and 30+ commands.",
  openGraph: {
    title: "Relay \u2014 Telegram bot for AI coding agents",
    description:
      "Control OpenCode, Claude Code, and OpenAI Codex from Telegram.",
    siteName: "Relay",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Relay \u2014 Telegram bot for AI coding agents",
    description:
      "Control OpenCode, Claude Code, and OpenAI Codex from Telegram.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
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
