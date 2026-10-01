import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { ScrollProgress } from "@/components/ScrollProgress";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const title = "Kalisizo Coffee Farmers Cooperative Society Ltd";
const description =
  "Empowering local farmers through quality coffee, sustainable agriculture and reliable financial services in Kyotera District. Working together with transparency and respect.";
const siteBase = SITE_URL ? new URL(SITE_URL) : undefined;
const ogImage = SITE_URL ? `${SITE_URL}/og.png` : undefined;

export const metadata: Metadata = {
  title,
  description,
  applicationName: title,
  metadataBase: siteBase,
  alternates: {
    canonical: SITE_URL ? "/" : undefined,
  },
  keywords: [
    "coffee cooperative",
    "Kalisizo",
    "Kyotera District",
    "Uganda coffee",
    "farmer SACCO",
    "sustainable coffee farming",
    "coffee inputs",
    "farmers cooperative",
  ],
  openGraph: {
    title,
    description:
      "Empowering local farmers through quality coffee, sustainable agriculture and reliable financial services in Kyotera District.",
    type: "website",
    locale: "en_UG",
    url: SITE_URL,
    siteName: title,
    ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630, alt: title }] } : {}),
  },
  twitter: {
    card: "summary_large_image",
    title,
    description:
      "Empowering local farmers through quality coffee, sustainable agriculture and reliable financial services in Kyotera District.",
    ...(ogImage ? { images: [ogImage] } : {}),
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-screen antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-forest focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-cream focus:shadow-card"
        >
          Skip to main content
        </a>
        <ScrollProgress />
        {children}
      </body>
    </html>
  );
}