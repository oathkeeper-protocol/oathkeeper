"use client";

import { useState, useEffect } from "react";
import {
  MiniKit,
  VerificationLevel,
  ISuccessResult,
  MiniAppSendTransactionPayload,
} from "@worldcoin/minikit-js";
import { motion, AnimatePresence } from "framer-motion";
import { createPublicClient, http, parseAbi, formatEther } from "viem";
import { sepolia } from "viem/chains";

type Screen = "home" | "register" | "slas" | "claim";

const SLA_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_SLA_CONTRACT_ADDRESS || "0x7c8C2E0D488d2785040171f4C087B0EA7637DE91";
const TENDERLY_RPC = "https://virtual.sepolia.eu.rpc.tenderly.co/47ad454d-8109-4ccb-9285-7ab201835e5d";
const MAX_BOND_ETH = 3; // Demo: max 3 ETH for visual scaling

const SLA_ABI = parseAbi([
  "function slaCount() view returns (uint256)",
  "function slas(uint256) view returns (address provider, address tenant, uint256 bondAmount, uint256 responseTimeHrs, uint256 minUptimeBps, uint256 penaltyBps, uint256 createdAt, bool active)",
  "function fileClaim(uint256 slaId, string description) external",
]);

type SLAData = {
  id: number;
  provider: string;
  tenant: string;
  bondAmount: bigint;
  minUptimeBps: bigint;
  active: boolean;
};

const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http(TENDERLY_RPC),
});

// --- Animation variants ---
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const } },
};

// --- Components ---

function Toast({ message, type, onClose }: { message: string; type: "success" | "info" | "error"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const bg = type === "success" ? "bg-green-500" : type === "info" ? "bg-blue-500" : "bg-red-500";

  return (
    <motion.div
      initial={{ opacity: 0, y: -40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -40 }}
      className={`fixed top-14 left-4 right-4 z-50 ${bg} text-white rounded-2xl px-4 py-3 shadow-lg`}
      onClick={onClose}
    >
      <p className="text-[15px] font-medium">{message}</p>
    </motion.div>
  );
}

function BondHealthBar({ bond }: { bond: number }) {
  const pct = Math.min((bond / MAX_BOND_ETH) * 100, 100);
  return (
    <div className="mt-3">
      <div className="flex justify-between text-[12px] mb-1.5" style={{ color: "var(--muted)" }}>
        <span>Bond Health</span>
        <span className="text-white font-medium">{bond.toFixed(4)} ETH</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%`, background: "var(--chainlink-blue)" }}
        />
      </div>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="py-3 pr-4 -ml-1 mb-4"
      style={{ color: "var(--muted)" }}
    >
      <span className="text-[15px]">Back</span>
    </button>
  );
}

// --- Main App ---

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [isInWorldApp, setIsInWorldApp] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" | "error" } | null>(null);
  const [claimForm, setClaimForm] = useState({ slaId: "0", description: "" });
  const [claimStatus, setClaimStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [slas, setSlas] = useState<SLAData[]>([]);
  const [slasLoading, setSlasLoading] = useState(false);
  const [slasError, setSlasError] = useState(false);

  // iOS :active fix — required for touch feedback in iOS WebView
  useEffect(() => {
    document.addEventListener("touchstart", () => {}, { passive: true });
  }, []);

  useEffect(() => {
    setIsInWorldApp(MiniKit.isInstalled());
    // Apply safe area insets from MiniKit
    if (MiniKit.isInstalled()) {
      const insets = (MiniKit as unknown as { deviceProperties?: { safeAreaInsets?: { top: number; bottom: number } } }).deviceProperties;
      if (insets?.safeAreaInsets) {
        document.documentElement.style.setProperty("--sat", `${insets.safeAreaInsets.top}px`);
        document.documentElement.style.setProperty("--sab", `${insets.safeAreaInsets.bottom}px`);
      }
    }
  }, []);

  const fetchSLAs = async () => {
    setSlasLoading(true);
    setSlasError(false);
    try {
      const count = await sepoliaClient.readContract({
        address: SLA_CONTRACT_ADDRESS as `0x${string}`,
        abi: SLA_ABI,
        functionName: "slaCount",
      });
      const n = Number(count);
      const results = await Promise.all(
        Array.from({ length: n }, (_, i) =>
          sepoliaClient.readContract({
            address: SLA_CONTRACT_ADDRESS as `0x${string}`,
            abi: SLA_ABI,
            functionName: "slas",
            args: [BigInt(i)],
          })
        )
      );
      setSlas(
        results.map((data, i) => {
          const [provider, tenant, bondAmount, , minUptimeBps, , , active] = data;
          return { id: i, provider, tenant, bondAmount, minUptimeBps, active };
        })
      );
    } catch (err) {
      console.error("Failed to fetch SLAs:", err);
      setSlasError(true);
    } finally {
      setSlasLoading(false);
    }
  };

  const handleProviderRegister = async () => {
    setRegistering(true);
    setTxStatus(null);

    try {
      if (!MiniKit.isInstalled()) {
        throw new Error("Please open in World App");
      }

      const { finalPayload } = await MiniKit.commandsAsync.verify({
        action: "oathlayer-provider-register",
        signal: "",
        verification_level: VerificationLevel.Device,
      });

      if (finalPayload.status === "error") {
        throw new Error(`World ID error: ${JSON.stringify(finalPayload)}`);
      }

      console.log("=== MINIKIT PAYLOAD ===", JSON.stringify(finalPayload));

      const res = await fetch("/api/register-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalPayload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Registration failed");
      }

      const data = await res.json();
      setTxStatus(`Registered! CRE will relay to Sepolia. Tx: ${data.txHash?.slice(0, 12)}...`);
      setRegistered(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.includes("Already registered")) {
        setToast({ message: "Already registered — CRE is relaying your identity to Sepolia", type: "info" });
        setRegistered(true);
      } else {
        setTxStatus(`Error: ${msg}`);
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleFileClaim = async () => {
    if (!claimForm.description) return;
    setClaimStatus("pending");

    try {
      if (!MiniKit.isInstalled()) {
        throw new Error("Please open in World App to file claims");
      }

      const { finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: SLA_CONTRACT_ADDRESS,
            abi: SLA_ABI,
            functionName: "fileClaim",
            args: [BigInt(claimForm.slaId), claimForm.description],
          },
        ],
      });

      const payload = finalPayload as MiniAppSendTransactionPayload;
      if (payload.status === "error") throw new Error("Transaction rejected");

      setClaimStatus("success");
    } catch (err: unknown) {
      console.error(err);
      setClaimStatus("error");
    }
  };

  const handleSLATap = (slaId: number) => {
    setClaimForm({ slaId: String(slaId), description: "" });
    setClaimStatus("idle");
    setScreen("claim");
  };

  return (
    <div className="min-h-screen text-white flex flex-col relative" style={{ background: "var(--background)", paddingTop: "var(--sat)" }}>
      {/* Ambient mesh gradient */}
      <div className="mesh-bg mesh-bg--healthy" />

      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>

      {/* Header */}
      <div className="px-5 pb-4 pt-2 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <img src="/logo-erased.png" width={32} height={32} alt="OathLayer" />
          <span className="font-semibold text-lg">OathLayer</span>
        </div>
        {isInWorldApp && (
          <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full">World App</span>
        )}
      </div>

      <AnimatePresence mode="wait">
        {screen === "home" && (
          <motion.div
            key="home"
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, x: -20 }}
            variants={stagger}
            className="flex-1 px-5 py-4 space-y-4 relative z-10"
          >
            <motion.div variants={fadeUp}>
              <h1 className="text-2xl font-bold">SLA Enforcement</h1>
              <p className="text-[15px] mt-1" style={{ color: "var(--muted)" }}>
                Automated penalty enforcement for real-world service agreements, powered by Chainlink CRE
              </p>
            </motion.div>

            <motion.div variants={stagger} className="grid grid-cols-2 gap-3">
              {[
                { label: "Network", value: "Sepolia", color: "text-blue-400" },
                { label: "Powered by", value: "CRE", color: "text-green-400" },
                { label: "Identity", value: "World ID", color: "text-purple-400" },
                { label: "Prediction", value: "AI Risk", color: "text-orange-400" },
              ].map((stat) => (
                <motion.div key={stat.label} variants={fadeUp} className="glass-card rounded-2xl p-4">
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{stat.label}</p>
                  <p className={`text-lg font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                </motion.div>
              ))}
            </motion.div>

            <motion.div variants={fadeUp} className="space-y-3 pt-2">
              <button
                onClick={() => setScreen("register")}
                className="w-full btn-primary rounded-2xl py-4 text-[15px] font-semibold"
              >
                Register as Provider
              </button>
              <button
                onClick={() => { fetchSLAs(); setScreen("slas"); }}
                className="w-full glass-card text-white rounded-2xl py-4 text-[15px] font-semibold"
              >
                View Active SLAs
              </button>
              <button
                onClick={() => setScreen("claim")}
                className="w-full glass-card text-white rounded-2xl py-4 text-[15px] font-semibold"
              >
                File a Claim
              </button>
            </motion.div>

            <motion.div variants={fadeUp} className="glass-card rounded-2xl p-4 mt-4">
              <p className="text-xs font-semibold mb-3" style={{ color: "var(--muted)" }}>HOW IT WORKS</p>
              <div className="space-y-2">
                {[
                  { step: "1", text: "Verify identity with World ID" },
                  { step: "2", text: "CRE relays your registration to Sepolia" },
                  { step: "3", text: "Bond ETH as SLA collateral" },
                  { step: "4", text: "CRE auto-enforces uptime breaches" },
                ].map((item) => (
                  <div key={item.step} className="flex items-center gap-3">
                    <div
                      className="w-5 h-5 rounded-full text-xs flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(55, 91, 210, 0.2)", color: "var(--chainlink-light)" }}
                    >
                      {item.step}
                    </div>
                    <p className="text-[15px]" style={{ color: "var(--muted-strong)" }}>{item.text}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}

        {screen === "register" && (
          <motion.div
            key="register"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 px-5 py-4 relative z-10"
          >
            <BackButton onBack={() => setScreen("home")} />
            <h2 className="text-xl font-bold mb-2">Register as Provider</h2>
            <p className="text-[15px] mb-6" style={{ color: "var(--muted)" }}>
              Verify with World ID on World Chain. Chainlink CRE will relay your registration to Sepolia automatically.
            </p>

            <div className="glass-card rounded-2xl p-4 mb-6">
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                <span style={{ color: "var(--chainlink-light)" }}>World App</span>
                <span>→ World Chain</span>
                <span className="text-orange-400">→ CRE</span>
                <span>→ Sepolia</span>
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                World ID proof verified on World Chain, CRE bridges registration cross-chain
              </p>
            </div>

            {registered ? (
              <div className="rounded-2xl p-4" style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)" }}>
                <p className="text-green-400 font-semibold">Registered as Provider</p>
                <p className="text-[15px] mt-1" style={{ color: "var(--muted)" }}>{txStatus}</p>
                <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>Chainlink CRE will relay your registration to Sepolia and run a compliance check automatically.</p>
              </div>
            ) : (
              <button
                onClick={handleProviderRegister}
                disabled={registering}
                className="w-full btn-primary disabled:opacity-50 rounded-2xl py-4 text-[15px] font-semibold"
              >
                {registering ? "Verifying with World ID..." : "Verify with World ID"}
              </button>
            )}

            {txStatus && !registered && (
              <p className="text-red-400 text-[15px] mt-3">{txStatus}</p>
            )}
          </motion.div>
        )}

        {screen === "slas" && (
          <motion.div
            key="slas"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 px-5 py-4 relative z-10"
          >
            <BackButton onBack={() => setScreen("home")} />
            <h2 className="text-xl font-bold mb-4">Active SLAs</h2>
            {slasLoading ? (
              <div className="flex items-center justify-center py-12" role="status" aria-label="Loading SLAs">
                <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--chainlink-light)", borderTopColor: "transparent" }} />
                <span className="ml-3 text-[15px]" style={{ color: "var(--muted)" }}>Loading from Sepolia...</span>
              </div>
            ) : slasError ? (
              <div className="glass-card rounded-2xl p-6 text-center">
                <p className="text-red-400 font-semibold">Failed to load SLAs</p>
                <p className="text-[15px] mt-1" style={{ color: "var(--muted)" }}>Check your connection and try again</p>
                <button
                  onClick={fetchSLAs}
                  className="btn-primary rounded-2xl px-6 py-3 text-[15px] mt-4"
                >
                  Retry
                </button>
              </div>
            ) : slas.filter(s => s.active).length === 0 ? (
              <div className="glass-card rounded-2xl p-6 text-center">
                <p className="text-[15px]" style={{ color: "var(--muted)" }}>No active SLAs found</p>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>Create an SLA on the dashboard to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {slas.filter(s => s.active).map((sla) => (
                  <button
                    key={sla.id}
                    onClick={() => handleSLATap(sla.id)}
                    aria-label={`File claim for SLA ${sla.id}`}
                    className="glass-card rounded-2xl p-4 w-full text-left"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-mono" style={{ color: "var(--muted)" }}>SLA #{sla.id}</p>
                        <p className="text-[15px] mt-0.5" style={{ color: "var(--muted-strong)" }}>
                          Provider: {sla.provider.slice(0, 6)}...{sla.provider.slice(-4)}
                        </p>
                        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                          Min uptime: {(Number(sla.minUptimeBps) / 100).toFixed(1)}%
                        </p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full text-green-400 bg-green-400/10">
                        Active
                      </span>
                    </div>
                    <BondHealthBar bond={Number(formatEther(sla.bondAmount))} />
                  </button>
                ))}
                <p className="text-xs text-center pt-2" style={{ color: "var(--muted)" }}>
                  Tap an SLA to file a claim
                </p>
              </div>
            )}
          </motion.div>
        )}

        {screen === "claim" && (
          <motion.div
            key="claim"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 px-5 py-4 relative z-10"
          >
            <BackButton onBack={() => setScreen("home")} />
            <h2 className="text-xl font-bold mb-2">File a Claim</h2>
            <p className="text-[15px] mb-6" style={{ color: "var(--muted)" }}>
              Report a maintenance issue. Your World App wallet signs the transaction directly.
            </p>

            {claimStatus === "success" ? (
              <div className="glass-card rounded-2xl p-4">
                <p className="text-green-400 font-semibold">Claim filed on-chain!</p>
                <p className="text-[15px] mt-1" style={{ color: "var(--muted)" }}>
                  CRE will monitor provider response time and auto-enforce if breached.
                </p>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => { setClaimStatus("idle"); setClaimForm({ slaId: "0", description: "" }); }}
                    className="btn-primary flex-1 py-3 text-[15px] rounded-2xl"
                  >
                    File Another
                  </button>
                  <button
                    onClick={() => setScreen("home")}
                    className="glass-card flex-1 py-3 text-[15px] text-white rounded-2xl"
                  >
                    Home
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label htmlFor="sla-id" className="text-xs mb-1 block" style={{ color: "var(--muted)" }}>SLA ID</label>
                  <input
                    id="sla-id"
                    type="number"
                    value={claimForm.slaId}
                    onChange={e => setClaimForm({ ...claimForm, slaId: e.target.value })}
                    className="w-full rounded-2xl px-4 py-3 text-white"
                    min="0"
                  />
                </div>
                <div>
                  <label htmlFor="claim-desc" className="text-xs mb-1 block" style={{ color: "var(--muted)" }}>Description</label>
                  <textarea
                    id="claim-desc"
                    rows={4}
                    value={claimForm.description}
                    onChange={e => setClaimForm({ ...claimForm, description: e.target.value })}
                    placeholder="Describe the maintenance issue..."
                    className="w-full rounded-2xl px-4 py-3 text-white resize-none"
                  />
                </div>
                <button
                  onClick={handleFileClaim}
                  disabled={claimStatus === "pending" || !claimForm.description}
                  className="w-full btn-primary disabled:opacity-50 rounded-2xl py-4 text-[15px] font-semibold"
                >
                  {claimStatus === "pending" ? "Submitting..." : "Submit Claim"}
                </button>
                {claimStatus === "error" && (
                  <p className="text-red-400 text-[15px]">Failed to submit. Make sure you are in World App.</p>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
