import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MiniKitProvider } from "./providers";

export const metadata: Metadata = {
  title: "OathLayer",
  description: "On-chain SLA enforcement — World App Mini App",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen">
        <MiniKitProvider>{children}</MiniKitProvider>
      </body>
    </html>
  );
}
