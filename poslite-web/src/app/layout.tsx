import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/shared/ui/sonner";

import { DeviceBootstrap } from "./device-bootstrap";
import { ServiceWorkerProvider } from "./service-worker-provider";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerProvider>
          <DeviceBootstrap />
          {children}
          <Toaster position="top-center" offset={72} duration={2500} richColors />
        </ServiceWorkerProvider>
      </body>
    </html>
  );
}
