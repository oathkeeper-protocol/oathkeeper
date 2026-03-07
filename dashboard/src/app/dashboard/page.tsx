"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useReadContract, useReadContracts, usePublicClient, useWatchContractEvent } from "wagmi";
import { formatEther, parseAbiItem } from "viem";
import { SLA_CONTRACT_ADDRESS, SLA_ABI, DEPLOY_BLOCK } from "@/lib/contract";
import Link from "next/link";

// --- Types ---
type SLAData = {
  id: number;
  provider: string;
  tenant: string;
  serviceName: string;
  bondAmount: bigint;
  responseTimeHrs: bigint;
  minUptimeBps: bigint;
  penaltyBps: bigint;
  createdAt: bigint;
  active: boolean;
};

type BreachWarningEvent = {
  slaId: bigint;
  riskScore: bigint;
  prediction: string;
  blockNumber: bigint;
};

type BreachEvent = {
  slaId: bigint;
  provider: string;
  uptimeBps: bigint;
  penaltyAmount: bigint;
  blockNumber: bigint;
  transactionHash: string;
};

// --- Animation variants ---
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
};

const TENDERLY_EXPLORER = process.env.NEXT_PUBLIC_TENDERLY_EXPLORER || "";

// --- Skeleton ---

function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded-lg ${className}`}
      style={{ background: "rgba(255,255,255,0.06)", ...style }}
    />
  );
}

function StatCardSkeleton() {
  return (
    <div className="glass-card glass-card-glow rounded-2xl p-5 md:p-6">
      <Skeleton className="h-3 w-20 mb-3" />
      <Skeleton className="h-8 w-16 mb-2" />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}

function SLACardSkeleton() {
  return (
    <div className="glass-card glass-card-glow rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2.5 mb-2">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-5 w-12 rounded-md" />
          </div>
          <Skeleton className="h-4 w-40 mb-1.5" />
          <Skeleton className="h-3 w-56" />
        </div>
        <Skeleton className="h-9 w-16 rounded-lg" />
      </div>
      <div className="mt-3">
        <div className="flex justify-between mb-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
    </div>
  );
}

function PredictionCardSkeleton() {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-5 w-20 rounded-md" />
      </div>
      <Skeleton className="h-5 w-24 rounded-md mb-2" />
      <Skeleton className="h-3 w-full mb-1" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

// --- Components ---

function StatCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <motion.div
      variants={fadeUp}
      className="glass-card glass-card-glow rounded-2xl p-5 md:p-6"
    >
      <p className="text-[13px] font-medium" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="text-2xl md:text-3xl font-semibold mt-2 text-white tracking-tight">{value}</p>
      {subtitle && <p className="text-[12px] mt-1.5" style={{ color: "var(--muted)" }}>{subtitle}</p>}
    </motion.div>
  );
}

function BondHealthBar({ bond, max }: { bond: number; max: number }) {
  const pct = max > 0 ? Math.min((bond / max) * 100, 100) : 0;
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

function RiskBadge({ score }: { score: number }) {
  const isHigh = score > 70;
  const isMed = score > 50;
  return (
    <span
      className="px-2.5 py-1 rounded-md text-[11px] font-medium"
      style={{
        color: isHigh ? "#ef4444" : isMed ? "#f59e0b" : "var(--muted-strong)",
        background: isHigh ? "rgba(239,68,68,0.1)" : isMed ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.05)",
      }}
    >
      {isHigh ? "High" : isMed ? "Medium" : "Low"} · {score}
    </span>
  );
}

function TribunalBadge({ tally }: { tally: string }) {
  const isBreach = tally.includes("BREACH");
  const isClear = tally.includes("CLEAR");
  return (
    <span
      className="px-2.5 py-1 rounded-md text-[11px] font-mono font-medium"
      style={{
        color: isBreach ? "#ef4444" : isClear ? "rgba(74,222,128,0.8)" : "#f59e0b",
        background: isBreach ? "rgba(239,68,68,0.1)" : isClear ? "rgba(74,222,128,0.08)" : "rgba(245,158,11,0.1)",
      }}
    >
      {tally}
    </span>
  );
}

function parseTribunalPrediction(prediction: string): { tally: string; summary: string } {
  const match = prediction.match(/^\[([^\]]+)\]\s*(.*)/);
  if (match) return { tally: match[1], summary: match[2] };
  return { tally: "", summary: prediction };
}

// --- Main Dashboard ---

function DemoControls() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

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
      setStatus(data.message || data.error || JSON.stringify(data));
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setLoading(null);
    }
  }, []);

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
            <p className="font-semibold text-white text-[14px] mb-3">Demo Controls</p>
            <div className="space-y-2">
              <button
                onClick={() => callDemo("demo-breach", { uptime: 94.0 })}
                disabled={!!loading}
                className="w-full py-2 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-40"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}
              >
                {loading === "demo-breach" ? "Triggering..." : "Trigger Breach (94% uptime)"}
              </button>
              <button
                onClick={() => callDemo("trigger-scan")}
                disabled={!!loading}
                className="w-full py-2 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-40"
                style={{ background: "rgba(55,91,210,0.1)", border: "1px solid rgba(55,91,210,0.2)", color: "var(--chainlink-light)" }}
              >
                {loading === "trigger-scan" ? "Scanning..." : "Run CRE Scan"}
              </button>
              <button
                onClick={() => callDemo("reset")}
                disabled={!!loading}
                className="w-full py-2 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--card-border)", color: "var(--muted-strong)" }}
              >
                {loading === "reset" ? "Resetting..." : "Reset to Healthy"}
              </button>
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

export default function Dashboard() {
  const publicClient = usePublicClient();

  const { data: slaCount } = useReadContract({
    address: SLA_CONTRACT_ADDRESS,
    abi: SLA_ABI,
    functionName: "slaCount",
  });

  const { data: breachCount } = useReadContract({
    address: SLA_CONTRACT_ADDRESS,
    abi: SLA_ABI,
    functionName: "breachCount",
  });

  const slaIds = Array.from({ length: Number(slaCount ?? 0) }, (_, i) => i);
  const { data: slaResults } = useReadContracts({
    contracts: slaIds.map(id => ({
      address: SLA_CONTRACT_ADDRESS,
      abi: SLA_ABI,
      functionName: "slas" as const,
      args: [BigInt(id)] as const,
    })),
  });

  const slas: SLAData[] = (slaResults ?? []).map((result, i) => {
    if (result.status !== "success" || !result.result) return null;
    const r = result.result as readonly [string, string, string, bigint, bigint, bigint, bigint, bigint, boolean];
    return {
      id: i, provider: r[0], tenant: r[1], serviceName: r[2], bondAmount: r[3], responseTimeHrs: r[4],
      minUptimeBps: r[5], penaltyBps: r[6], createdAt: r[7], active: r[8],
    };
  }).filter(Boolean) as SLAData[];

  const [breachWarnings, setBreachWarnings] = useState<BreachWarningEvent[]>([]);
  const [breachEvents, setBreachEvents] = useState<BreachEvent[]>([]);

  useEffect(() => {
    if (!publicClient) return;
    const fetchEvents = async () => {
      const [warningLogs, breachLogs] = await Promise.all([
        publicClient.getLogs({
          address: SLA_CONTRACT_ADDRESS,
          event: parseAbiItem("event BreachWarning(uint256 indexed slaId, uint256 riskScore, string prediction)"),
          fromBlock: DEPLOY_BLOCK, toBlock: "latest",
        }),
        publicClient.getLogs({
          address: SLA_CONTRACT_ADDRESS,
          event: parseAbiItem("event SLABreached(uint256 indexed slaId, address indexed provider, uint256 uptimeBps, uint256 penaltyAmount)"),
          fromBlock: DEPLOY_BLOCK, toBlock: "latest",
        }),
      ]);
      setBreachWarnings(warningLogs.map(log => ({
        slaId: log.args.slaId!, riskScore: log.args.riskScore!,
        prediction: log.args.prediction!, blockNumber: log.blockNumber,
      })));
      setBreachEvents(breachLogs.map(log => ({
        slaId: log.args.slaId!, provider: log.args.provider!,
        uptimeBps: log.args.uptimeBps!, penaltyAmount: log.args.penaltyAmount!,
        blockNumber: log.blockNumber, transactionHash: log.transactionHash,
      })));
    };
    fetchEvents();
  }, [publicClient]);

  useWatchContractEvent({
    address: SLA_CONTRACT_ADDRESS, abi: SLA_ABI, eventName: "BreachWarning",
    onLogs(logs) {
      const newWarnings = (logs as unknown as { args: { slaId: bigint; riskScore: bigint; prediction: string }; blockNumber: bigint }[])
        .map(log => ({ slaId: log.args.slaId, riskScore: log.args.riskScore, prediction: log.args.prediction, blockNumber: log.blockNumber }));
      setBreachWarnings(prev => {
        const existingKeys = new Set(prev.map(w => `${w.slaId}-${w.blockNumber}`));
        const fresh = newWarnings.filter(w => !existingKeys.has(`${w.slaId}-${w.blockNumber}`));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
    },
    poll: true, pollingInterval: 5_000,
  });

  useWatchContractEvent({
    address: SLA_CONTRACT_ADDRESS, abi: SLA_ABI, eventName: "SLABreached",
    onLogs(logs) {
      const newBreaches = (logs as unknown as { args: { slaId: bigint; provider: string; uptimeBps: bigint; penaltyAmount: bigint }; blockNumber: bigint; transactionHash: string }[])
        .map(log => ({ slaId: log.args.slaId, provider: log.args.provider, uptimeBps: log.args.uptimeBps, penaltyAmount: log.args.penaltyAmount, blockNumber: log.blockNumber, transactionHash: log.transactionHash }));
      setBreachEvents(prev => {
        const existingHashes = new Set(prev.map(e => e.transactionHash));
        const fresh = newBreaches.filter(b => !existingHashes.has(b.transactionHash));
        return fresh.length ? [...fresh, ...prev] : prev;
      });
    },
    poll: true, pollingInterval: 5_000,
  });

  const activeSLAs = slas.filter(s => s.active).length;
  const totalBonded = slas.reduce((sum, s) => sum + Number(formatEther(s.bondAmount)), 0);
  const breachCountNum = Number(breachCount ?? 0);

  // All warnings sorted newest first (full history, can have multiple per SLA)
  const allWarningsSorted = [...breachWarnings].sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));

  // Latest risk score per SLA (for badge on SLA cards)
  const latestRiskScores = new Map<number, number>();
  for (const w of allWarningsSorted) {
    const id = Number(w.slaId);
    if (!latestRiskScores.has(id)) latestRiskScores.set(id, Number(w.riskScore));
  }

  // SLAs sorted newest first (highest ID = most recently created)
  const slasSorted = [...slas].reverse();

  const SLA_PREVIEW = 4;
  const PREDICTION_PREVIEW = 6;
  const isLoading = slaCount === undefined;

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-3">
            <Skeleton className="h-5 w-36 mb-1" />
            {Array.from({ length: 3 }).map((_, i) => <SLACardSkeleton key={i} />)}
          </div>
          <div className="lg:col-span-2 space-y-2">
            <Skeleton className="h-5 w-28 mb-1" />
            {Array.from({ length: 4 }).map((_, i) => <PredictionCardSkeleton key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="space-y-8"
    >
      {/* Header */}
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">Dashboard</h1>
        <p className="text-[14px] mt-1" style={{ color: "var(--muted)" }}>
          Real-time compliance monitoring for tokenized RWA service agreements
        </p>
      </motion.div>

      {/* Stats */}
      <motion.div variants={stagger} className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="Active SLAs" value={`${activeSLAs}`} subtitle="agreements enforced" />
        <StatCard label="Total Bonded" value={`${totalBonded.toFixed(2)} ETH`} subtitle="locked as collateral" />
        <StatCard label="Verdicts" value={`${allWarningsSorted.length}`} subtitle="tribunal predictions" />
        <StatCard label="Breaches" value={`${breachCountNum}`} subtitle="penalties executed" />
      </motion.div>

      {/* Two-column: SLAs (left) + Predictions (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Active Agreements (3/5 width) */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-white">Active Agreements</h2>
            {slas.length > SLA_PREVIEW && (
              <Link
                href="/dashboard/slas"
                className="text-[12px] font-medium"
                style={{ color: "var(--chainlink-light)" }}
              >
                View all →
              </Link>
            )}
          </div>
          {slas.length === 0 ? (
            <div className="glass-card rounded-2xl p-10 text-center">
              <p style={{ color: "var(--muted)" }}>No SLAs found. Connect to a deployed contract to see live data.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {slasSorted.slice(0, SLA_PREVIEW).map((sla) => {
                const riskScore = latestRiskScores.get(sla.id);
                return (
                  <div
                    key={sla.id}
                    className="glass-card glass-card-glow rounded-2xl p-5"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="text-[12px] font-mono" style={{ color: "var(--muted)" }}>SLA #{sla.id}</span>
                          <span
                            className="px-2 py-0.5 rounded-md text-[11px] font-medium"
                            style={{
                              color: sla.active ? "rgba(74,222,128,0.8)" : "rgba(239,68,68,0.8)",
                              background: sla.active ? "rgba(74,222,128,0.08)" : "rgba(239,68,68,0.08)",
                            }}
                          >
                            {sla.active ? "Active" : "Inactive"}
                          </span>
                          {riskScore !== undefined && <RiskBadge score={riskScore} />}
                        </div>
                        <p className="text-white text-[14px] font-medium mt-1.5">
                          {sla.serviceName || "Service"} <span className="font-mono text-[12px] ml-1" style={{ color: "var(--muted)" }}>{sla.provider.slice(0, 10)}...</span>
                        </p>
                        <p className="text-[12px] mt-0.5" style={{ color: "var(--muted)" }}>
                          Min uptime: {Number(sla.minUptimeBps) / 100}% &middot; Response: {Number(sla.responseTimeHrs)}h &middot; Penalty: {Number(sla.penaltyBps) / 100}%
                        </p>
                      </div>
                      <Link
                        href={`/sla/${sla.id}`}
                        className="btn-primary px-4 py-2 text-[13px]"
                      >
                        View
                      </Link>
                    </div>
                    <BondHealthBar bond={Number(formatEther(sla.bondAmount))} max={3} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: AI Tribunal Predictions history (2/5 width) */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-white">AI Tribunal</h2>
            {allWarningsSorted.length > PREDICTION_PREVIEW && (
              <Link
                href="/dashboard/predictions"
                className="text-[12px] font-medium"
                style={{ color: "var(--chainlink-light)" }}
              >
                View all →
              </Link>
            )}
          </div>
          {allWarningsSorted.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <p className="text-[13px]" style={{ color: "var(--muted)" }}>No tribunal verdicts yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allWarningsSorted.slice(0, PREDICTION_PREVIEW).map((w, i) => {
                const { tally, summary } = parseTribunalPrediction(w.prediction);
                return (
                  <div
                    key={`${w.slaId}-${w.blockNumber}-${i}`}
                    className="glass-card rounded-xl p-4"
                    style={{
                      borderColor: Number(w.riskScore) > 70 ? "rgba(239,68,68,0.15)" : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-[12px]" style={{ color: "var(--muted)" }}>SLA #{Number(w.slaId)}</span>
                      <RiskBadge score={Number(w.riskScore)} />
                    </div>
                    {tally && (
                      <div className="mb-1.5">
                        <TribunalBadge tally={tally} />
                      </div>
                    )}
                    <p className="text-[12px] leading-relaxed" style={{ color: "var(--muted-strong)" }}>{summary}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Breaches */}
      {breachEvents.length > 0 && (
        <div>
          <h2 className="text-[15px] font-semibold text-white mb-3">Recent Breaches</h2>
          <div className="glass-card rounded-2xl overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                  {["SLA", "Provider", "Uptime", "Penalty", "Block", "Tx"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {breachEvents.slice(0, 20).map((breach, i) => (
                  <tr
                    key={`${breach.transactionHash}-${i}`}
                    style={{
                      borderBottom: i < 19 ? "1px solid var(--card-border)" : "none",
                      background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                    }}
                  >
                    <td className="px-4 py-3 text-white font-mono">#{Number(breach.slaId)}</td>
                    <td className="px-4 py-3 font-mono" style={{ color: "var(--muted-strong)" }}>{breach.provider.slice(0, 10)}...</td>
                    <td className="px-4 py-3 text-white">{Number(breach.uptimeBps) / 100}%</td>
                    <td className="px-4 py-3 text-white">{formatEther(breach.penaltyAmount)} ETH</td>
                    <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{Number(breach.blockNumber)}</td>
                    <td className="px-4 py-3 font-mono">
                      {TENDERLY_EXPLORER ? (
                        <a
                          href={`${TENDERLY_EXPLORER}/tx/${breach.transactionHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                          style={{ color: "var(--chainlink-light)" }}
                        >
                          {breach.transactionHash.slice(0, 10)}...
                        </a>
                      ) : (
                        <span style={{ color: "var(--chainlink-light)" }}>{breach.transactionHash.slice(0, 10)}...</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
    <Suspense fallback={null}>
      <DemoGate />
    </Suspense>
    </>
  );
}

function DemoGate() {
  const searchParams = useSearchParams();
  if (searchParams.get("demo") !== "true") return null;
  return <DemoControls />;
}
