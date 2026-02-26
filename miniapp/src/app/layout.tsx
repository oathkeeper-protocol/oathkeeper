import type { Metadata } from "next";
import "./globals.css";
import { MiniKitProvider } from "./providers";

export const metadata: Metadata = {
  title: "OathKeeper",
  description: "On-chain SLA enforcement — World App Mini App",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white">
        <MiniKitProvider>{children}</MiniKitProvider>
      </body>
    </html>
  );
}
