"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance } from "wagmi";
import { formatEther } from "viem";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

const VNET_RPC = process.env.NEXT_PUBLIC_RPC_URL || "";
const TENDERLY_EXPLORER = process.env.NEXT_PUBLIC_TENDERLY_EXPLORER || "";

const NAV_LINKS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Register", href: "/provider/register" },
  { label: "Create SLA", href: "/sla/create" },
  { label: "Claims", href: "/claims" },
  { label: "Arbitrate", href: "/arbitrate" },
];

function DemoBanner({ onDismiss }: { onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  const copyRpc = () => {
    navigator.clipboard.writeText(VNET_RPC);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(8px)",
      }}
      onClick={onDismiss}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
        className="glass-card glass-card-glow rounded-2xl p-6 max-w-md mx-4"
        style={{ border: "1px solid rgba(55,91,210,0.3)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-semibold"
            style={{ background: "rgba(55,91,210,0.2)", color: "var(--chainlink-light)" }}
          >
            !
          </div>
          <div>
            <p className="font-semibold text-white text-[15px]">Demo Mode</p>
            <p className="text-[12px]" style={{ color: "var(--muted)" }}>Tenderly Virtual Network (Sepolia fork)</p>
          </div>
        </div>

        <p className="text-[13px] leading-relaxed mb-4" style={{ color: "var(--muted-strong)" }}>
          This demo runs on a <span className="text-white">Tenderly VNet</span>. To interact, set your wallet&apos;s Sepolia RPC to:
        </p>

        <div
          className="flex items-center gap-2 p-3 rounded-lg mb-4 cursor-pointer group"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--card-border)" }}
          onClick={copyRpc}
        >
          <code className="flex-1 text-[11px] font-mono text-white break-all leading-relaxed">
            {VNET_RPC}
          </code>
          <span
            className="shrink-0 text-[11px] px-2 py-1 rounded-md font-medium transition-colors"
            style={{
              color: copied ? "rgba(74,222,128,0.8)" : "var(--chainlink-light)",
              background: copied ? "rgba(74,222,128,0.08)" : "rgba(55,91,210,0.15)",
            }}
          >
            {copied ? "Copied!" : "Copy"}
          </span>
        </div>

        <div className="text-[12px] space-y-1.5 mb-4" style={{ color: "var(--muted)" }}>
          <p>1. Open wallet settings → Networks → Sepolia</p>
          <p>2. Replace RPC URL with the one above</p>
          <p>3. Fund your wallet using the Tenderly faucet</p>
        </div>

        <div className="flex gap-3">
          {TENDERLY_EXPLORER && (
            <a
              href={TENDERLY_EXPLORER}
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-2.5 rounded-lg text-[13px] font-medium text-center transition-colors"
              style={{ border: "1px solid var(--card-border)", color: "var(--muted-strong)" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              Open Tenderly Faucet
            </a>
          )}
          <button
            onClick={onDismiss}
            className={`${TENDERLY_EXPLORER ? "flex-1" : "w-full"} btn-primary py-2.5 text-[13px]`}
          >
            Got it
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function WalletBalance() {
  const { address } = useAccount();
  const { data } = useBalance({ address });

  if (!address || !data) return null;

  const formatted = parseFloat(formatEther(data.value)).toFixed(2);

  return (
    <span
      className="text-[13px] font-medium mr-3 px-3 py-1.5 rounded-lg"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--card-border)" }}
    >
      <span className="text-white font-mono">{formatted}</span>
      <span className="ml-1" style={{ color: "var(--muted)" }}>ETH</span>
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const [showDemo, setShowDemo] = useState(!isLanding);

  return (
    <div className="noise-overlay">
      <AnimatePresence>
        {showDemo && !isLanding && <DemoBanner onDismiss={() => setShowDemo(false)} />}
      </AnimatePresence>
      <nav
        style={{
          background: isLanding ? "transparent" : "rgba(10, 10, 20, 0.8)",
          backdropFilter: isLanding ? "none" : "blur(16px)",
          WebkitBackdropFilter: isLanding ? "none" : "blur(16px)",
          borderBottom: isLanding ? "none" : "1px solid var(--card-border)",
          position: isLanding ? "absolute" : "sticky",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
        }}
      >
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <div className="flex items-center justify-between h-16 md:h-[72px]">
            {/* Left: Logo + nav */}
            <div className="flex items-center gap-10">
              <Link href="/" className="flex items-center gap-2.5 shrink-0">
                <Image src="/logo-square.png" width={28} height={28} alt="OathLayer" className="rounded-md" />
                <span className="font-semibold text-[15px] text-white tracking-tight">OathLayer</span>
              </Link>

              <div className="hidden md:flex items-center gap-1">
                {NAV_LINKS.map((link) => {
                  const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
                  return (
                    <Link
                      key={link.label}
                      href={link.href}
                      className="relative px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors"
                      style={{
                        color: isActive ? "#fff" : "rgba(255,255,255,0.45)",
                        background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.color = "rgba(255,255,255,0.7)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.color = "rgba(255,255,255,0.45)";
                      }}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Right: Balance + Wallet */}
            <div className="flex items-center">
              <WalletBalance />
              <ConnectButton
                showBalance={false}
                chainStatus="icon"
                accountStatus="address"
              />
            </div>
          </div>
        </div>
      </nav>

      {isLanding ? (
        children
      ) : (
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] as const }}
          className="max-w-7xl mx-auto px-6 md:px-10 py-8 md:py-10"
        >
          {children}
        </motion.main>
      )}
    </div>
  );
}
