import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "@/styles/depth4.css";
import "@/styles/hover-help.css";
import { ReactNode } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";
const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-sans" });

export const metadata: Metadata = {
  metadataBase: new URL("https://depth4.com"),
  title: {
    default: "DEPTH4",
    template: "%s",
  },
  description:
    "DEPTH4 is a macro intelligence engine that reads the news, thinks four steps ahead, and turns narratives into tradeable theses.",
  applicationName: "DEPTH4",
  appleWebApp: { capable: true, title: "DEPTH4" },
  manifest: "/manifest.webmanifest",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  alternates: { canonical: "/" },
  openGraph: {
    url: "/",
    siteName: "DEPTH4",
    title: "DEPTH4",
    description: "See the trade before the market does.",
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
        <AuthProvider>
          {children}
          <Toaster
            theme="dark"
            toastOptions={{
              style: {
                background: "#18181b",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "#fafafa",
                fontSize: "12px",
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
