import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "LeadRescue — Stalled Lead Follow-Up Action Layer for Agencies",
    template: "%s | LeadRescue",
  },
  description:
    "Detect stalled agency proposals, surface timely next actions, and execute personalized follow-up sequences with human-in-the-loop AI assistance.",
  keywords: [
    "agency lead follow up",
    "stalled leads",
    "proposal recovery",
    "agency sales pipeline",
    "b2b lead management",
  ],
  authors: [{ name: "LeadRescue" }],
  creator: "LeadRescue",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://leadrescue-akhileshrao89.vercel.app",
    title: "LeadRescue — Stalled Lead Follow-Up Action Layer for Agencies",
    description:
      "Stop losing $3,000–$10,000 agency proposals to forgotten inboxes. Daily action queues and human-in-the-loop lead recovery.",
    siteName: "LeadRescue",
  },
  twitter: {
    card: "summary_large_image",
    title: "LeadRescue — Stalled Lead Follow-Up Action Layer for Agencies",
    description:
      "Stop losing $3,000–$10,000 agency proposals to forgotten inboxes. Daily action queues and human-in-the-loop lead recovery.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
