import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/shared/ui/sonner";

import { DeviceBootstrap } from "./device-bootstrap";
import { ServiceWorkerProvider } from "./service-worker-provider";
import { ThemeProvider } from "./theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "POSLite",
  description: "Point of Sale offline-first untuk restoran",
};

export const viewport: Viewport = {
  // Matches the dark POS header and the manifest so the status bar blends in.
  themeColor: "#0f172a",
  // Lets content reach under the notch; screens pad themselves with the *-safe utilities.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <ServiceWorkerProvider>
            <DeviceBootstrap />
            {children}
            <Toaster />
          </ServiceWorkerProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
