"use client";

import { useState, useEffect, useCallback } from "react";
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
  { label: "Tenant", href: "/claims" },
  { label: "Arbitrate", href: "/arbitrate" },
];

function DemoBanner({ onDismiss, onEnableDemo }: { onDismiss: () => void; onEnableDemo: () => void }) {
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
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
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
          <button
            onClick={onDismiss}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[16px] transition-colors"
            style={{ color: "var(--muted)", background: "rgba(255,255,255,0.04)" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
          >
            &times;
          </button>
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
          <p>4. Click <span className="text-white">Demo Controls</span> to trigger breaches & scans</p>
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
            onClick={() => { onEnableDemo(); onDismiss(); }}
            className="flex-1 btn-primary py-2.5 text-[13px]"
          >
            Demo Controls
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function DemoControls({ onExit }: { onExit: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [uptime, setUptime] = useState("94.0");
  const [slaId, setSlaId] = useState("all");

  const callDemo = useCallback(async (action: string, params?: Record<string, unknown>) => {
    setLoading(action);
    setStatus(null);
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...params }),
      });
      const data = await res.json();
      if (res.status === 502) {
        setStatus("Mock API not running. Start it: cd workflow/mock-api && npm run dev");
      } else {
        setStatus(data.message || data.error || JSON.stringify(data));
      }
    } catch (e: unknown) {
      setStatus("Mock API not running. Start it: cd workflow/mock-api && npm run dev");
    } finally {
      setLoading(null);
    }
  }, []);

  const demoParams = {
    uptime: parseFloat(uptime),
    slaId: slaId === "all" ? null : parseInt(slaId),
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="glass-card glass-card-glow rounded-2xl p-5 mb-3 w-72"
            style={{ border: "1px solid rgba(55,91,210,0.3)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-white text-[14px]">Demo Controls</p>
              <button
                onClick={onExit}
                className="text-[11px] px-2 py-0.5 rounded-md transition-colors"
                style={{ color: "var(--muted)", border: "1px solid var(--card-border)" }}
                onMouseEnter={e => e.currentTarget.style.color = "#fff"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--muted)"}
              >
                Exit Demo
              </button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-medium shrink-0" style={{ color: "var(--muted)" }}>SLA</label>
                <input
                  type="text"
                  value={slaId}
                  onChange={e => setSlaId(e.target.value)}
                  placeholder="all"
                  className="flex-1 py-1.5 px-2 rounded-lg text-[12px] font-mono text-white bg-transparent outline-none"
                  style={{ border: "1px solid var(--card-border)" }}
                />
                <span className="text-[10px] shrink-0" style={{ color: "var(--muted)" }}>or #</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-medium shrink-0" style={{ color: "var(--muted)" }}>Uptime %</label>
                <input
                  type="number"
                  value={uptime}
                  onChange={e => setUptime(e.target.value)}
                  step="0.1"
                  min="0"
                  max="100"
                  className="flex-1 py-1.5 px-2 rounded-lg text-[12px] font-mono text-white bg-transparent outline-none"
                  style={{ border: "1px solid var(--card-border)" }}
                />
              </div>
              <button
                onClick={() => callDemo("demo-breach", demoParams)}
                disabled={!!loading}
                className="w-full py-2 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-40"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}
              >
                {loading === "demo-breach" ? "Breaching..." : `Simulate Breach (${uptime}%)`}
              </button>
              <button
                onClick={() => callDemo("demo-warning", demoParams)}
                disabled={!!loading}
                className="w-full py-2 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-40"
                style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", color: "#f59e0b" }}
              >
                {loading === "demo-warning" ? "Warning..." : "Warning Only (no slash)"}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => callDemo("time-warp", { hours: 25 })}
                  disabled={!!loading}
                  className="flex-1 py-2 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-40"
                  style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", color: "#8b5cf6" }}
                >
                  {loading === "time-warp" ? "Warping..." : "+25h"}
                </button>
                <button
                  onClick={() => { setUptime("99.9"); callDemo("reset"); }}
                  disabled={!!loading}
                  className="flex-1 py-2 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-40"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--card-border)", color: "var(--muted-strong)" }}
                >
                  {loading === "reset" ? "Resetting..." : "Reset"}
                </button>
              </div>
            </div>
            {status && (
              <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>{status}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen(!open)}
        className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105"
        style={{
          background: open ? "rgba(55,91,210,0.3)" : "rgba(55,91,210,0.15)",
          border: "1px solid rgba(55,91,210,0.3)",
          marginLeft: "auto",
        }}
        title="Demo Controls"
      >
        <span className="text-[18px]">{open ? "\u2715" : "\u2699"}</span>
      </button>
    </div>
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
  const [showBanner, setShowBanner] = useState(!isLanding);
  const [demoMode, setDemoMode] = useState(false);

  // Initialize demoMode from localStorage or ?demo=true on mount
  useEffect(() => {
    const stored = localStorage.getItem("oathlayer-demo");
    const fromUrl = new URLSearchParams(window.location.search).get("demo") === "true";
    if (stored === "true" || fromUrl) {
      setDemoMode(true);
      if (fromUrl) localStorage.setItem("oathlayer-demo", "true");
    }
  }, []);

  const enableDemo = () => {
    setDemoMode(true);
    localStorage.setItem("oathlayer-demo", "true");
  };

  const disableDemo = () => {
    setDemoMode(false);
    localStorage.removeItem("oathlayer-demo");
  };

  return (
    <div className="noise-overlay">
      <AnimatePresence>
        {showBanner && !isLanding && <DemoBanner onDismiss={() => setShowBanner(false)} onEnableDemo={enableDemo} />}
      </AnimatePresence>
      {demoMode && !isLanding && <DemoControls onExit={disableDemo} />}
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
