"use client";

import { motion } from "framer-motion";
import { formatEther } from "viem";
import { useDashboardData } from "@/hooks/usePonderData";
import Link from "next/link";

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

function TribunalBadge({ tally, penalized }: { tally: string; penalized: boolean }) {
  // Tally format: "3-0 BREACH", "2-1 BREACH", "0-3 CLEAR"
  // penalized = true means SLABreached event exists (actual slash with ETH penalty)
  const isBreach = tally.includes("BREACH");
  const isClear = tally.includes("CLEAR");
  const voteMatch = tally.match(/^(\d+-\d+)/);
  const votes = voteMatch ? voteMatch[1] : "";

  const label = penalized ? "PENALIZED" : isBreach ? "WARNING" : isClear ? "CLEAR" : tally;
  const color = penalized ? "#ef4444" : isBreach ? "#f59e0b" : "rgba(74,222,128,0.8)";
  const bg = penalized ? "rgba(239,68,68,0.1)" : isBreach ? "rgba(245,158,11,0.1)" : "rgba(74,222,128,0.08)";

  return (
    <span
      className="px-2 py-0.5 rounded-md text-[11px] font-mono font-medium"
      style={{ color, background: bg }}
    >
      {votes} {label}
    </span>
  );
}

// --- Main Dashboard ---

export default function Dashboard() {
  const {
    slas, breaches, warnings, isLoading,
    activeSLAs, totalBonded, breachCount,
    penalizedSlaIds, latestRiskScores,
  } = useDashboardData();

  // Warnings already sorted desc from Ponder query
  const allWarningsSorted = warnings;

  // SLAs already sorted desc from Ponder query
  const slasSorted = slas;

  const SLA_PREVIEW = 4;
  const PREDICTION_PREVIEW = 6;

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
        <StatCard label="Breaches" value={`${breachCount}`} subtitle="penalties executed" />
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
                const riskScore = latestRiskScores.get(Number(sla.slaId));
                return (
                  <div
                    key={sla.id}
                    className="glass-card glass-card-glow rounded-2xl p-5"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="text-[12px] font-mono" style={{ color: "var(--muted)" }}>SLA #{sla.slaId}</span>
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
                        href={`/sla/${sla.slaId}`}
                        className="btn-primary px-4 py-2 text-[13px]"
                      >
                        View
                      </Link>
                    </div>
                    <BondHealthBar bond={(Number(sla.bondAmount) - Number(sla.totalSlashed)) / 1e18} max={Number(sla.bondAmount) / 1e18} />
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
                const tally = w.tally || "";
                const summary = w.summary || w.prediction;
                return (
                  <div
                    key={`${w.slaId}-${w.blockNumber}-${i}`}
                    className="glass-card rounded-xl p-4"
                    style={{
                      borderColor: w.riskScore > 70 ? "rgba(239,68,68,0.15)" : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-[12px]" style={{ color: "var(--muted)" }}>SLA #{w.slaId}</span>
                      <RiskBadge score={w.riskScore} />
                    </div>
                    {tally && (
                      <div className="mb-1.5">
                        <TribunalBadge tally={tally} penalized={penalizedSlaIds.has(Number(w.slaId))} />
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
      {breaches.length > 0 && (
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
                {breaches.slice(0, 20).map((breach, i) => (
                  <tr
                    key={`${breach.transactionHash}-${i}`}
                    style={{
                      borderBottom: i < 19 ? "1px solid var(--card-border)" : "none",
                      background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                    }}
                  >
                    <td className="px-4 py-3 text-white font-mono">#{breach.slaId}</td>
                    <td className="px-4 py-3 font-mono" style={{ color: "var(--muted-strong)" }}>{breach.provider.slice(0, 10)}...</td>
                    <td className="px-4 py-3 text-white">{Number(breach.uptimeBps) / 100}%</td>
                    <td className="px-4 py-3 text-white">{formatEther(BigInt(breach.penaltyAmount))} ETH</td>
                    <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{breach.blockNumber}</td>
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
    </>
  );
}
