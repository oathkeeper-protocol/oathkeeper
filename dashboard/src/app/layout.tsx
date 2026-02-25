import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OathKeeper — On-Chain SLA Enforcement",
  description: "Automated SLA enforcement for tokenized real-world assets, powered by Chainlink CRE and World ID",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
        <nav className="border-b px-6 py-4" style={{ borderColor: 'var(--card-border)', background: 'var(--card)' }}>
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--chainlink-blue)' }}>
                <span className="text-white font-bold text-sm">OK</span>
              </div>
              <span className="font-bold text-lg text-white">OathKeeper</span>
              <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: 'var(--chainlink-blue)' }}>
                Powered by Chainlink CRE
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <a href="/" className="text-gray-400 hover:text-white transition-colors">Dashboard</a>
              <a href="/provider/register" className="text-gray-400 hover:text-white transition-colors">Register</a>
              <a href="/sla/create" className="text-gray-400 hover:text-white transition-colors">Create SLA</a>
              <a href="/claims" className="text-gray-400 hover:text-white transition-colors">Claims</a>
              <a href="/arbitrate" className="text-gray-400 hover:text-white transition-colors">Arbitrate</a>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
