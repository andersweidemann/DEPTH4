import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "@/styles/depth4.css";
import { ReactNode } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-sans" });

export const metadata: Metadata = {
  metadataBase: new URL("https://depth4.com"),
  title: "DEPTH4 — Geopolitical macro for your book",
  description: "Real-time news, consequence trees, and portfolio + order context for serious retail traders",
  applicationName: "DEPTH4",
  appleWebApp: { capable: true, title: "DEPTH4" },
  manifest: "/manifest.webmanifest",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  alternates: { canonical: "/" },
  openGraph: {
    url: "/",
    siteName: "DEPTH4",
    title: "DEPTH4 — Geopolitical macro for your book",
    description: "Real-time news, consequence trees, and portfolio + order context for serious retail traders",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn(inter.variable, "dark")} suppressHydrationWarning>
      <body className={cn(inter.className, "d4-skin")} style={{ margin: 0, minHeight: "100dvh" }} suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
