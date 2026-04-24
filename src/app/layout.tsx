import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

// Full Notion mode: Inter for everything, Geist Mono for labels only.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  // Load the full weight range so 400 body + 600 strong + 800 display all work.
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BetterYourAds — Meta ad diagnosis for founder-led SaaS",
  description:
    "Paste your URL. We pull your Meta ads, benchmark competitors, and hand you concepts you can actually ship.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">{children}</body>
    </html>
  );
}
