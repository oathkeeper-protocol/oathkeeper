"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useReadContract, useReadContracts, usePublicClient, useWatchContractEvent } from "wagmi";
import { formatEther, parseAbiItem } from "viem";
import { SLA_CONTRACT_ADDRESS, SLA_ABI, DEPLOY_BLOCK } from "@/lib/contract";
import Link from "next/link";

// --- Types ---
type SLAData = {
  id: number;
  provider: string;
  tenant: string;
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
    const r = result.result as readonly [string, string, bigint, bigint, bigint, bigint, bigint, boolean];
    return {
      id: i, provider: r[0], tenant: r[1], bondAmount: r[2], responseTimeHrs: r[3],
      minUptimeBps: r[4], penaltyBps: r[5], createdAt: r[6], active: r[7],
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

  const latestRiskScores = new Map<number, number>();
  for (const w of breachWarnings) {
    latestRiskScores.set(Number(w.slaId), Number(w.riskScore));
  }

  return (
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
        <StatCard label="Warnings" value={`${breachWarnings.length}`} subtitle="tribunal verdicts" />
        <StatCard label="Breaches" value={`${breachCountNum}`} subtitle="penalties executed" />
      </motion.div>

      {/* Breach Warnings */}
      {breachWarnings.length > 0 && (
        <motion.div variants={fadeUp}>
          <h2 className="text-[15px] font-semibold text-white mb-3">AI Tribunal Predictions</h2>
          <div className="space-y-2">
            {breachWarnings.slice(0, 10).map((w, i) => {
              const { tally, summary } = parseTribunalPrediction(w.prediction);
              return (
              <motion.div
                key={`${w.slaId}-${w.blockNumber}-${i}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="glass-card rounded-xl p-4 flex items-center justify-between"
                style={{
                  borderColor: Number(w.riskScore) > 70 ? "rgba(239,68,68,0.15)" : undefined,
                }}
              >
                <div className="flex-1 min-w-0 mr-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px]" style={{ color: "var(--muted)" }}>SLA #{Number(w.slaId)}</span>
                    {tally && <TribunalBadge tally={tally} />}
                  </div>
                  <p className="text-white text-[13px] mt-0.5 truncate">{summary}</p>
                </div>
                <RiskBadge score={Number(w.riskScore)} />
              </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* SLA Cards */}
      <motion.div variants={fadeUp}>
        <h2 className="text-[15px] font-semibold text-white mb-3">Active Agreements</h2>
        {slas.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center">
            <p style={{ color: "var(--muted)" }}>No SLAs found. Connect to a deployed contract to see live data.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {slas.map((sla, i) => {
              const riskScore = latestRiskScores.get(sla.id);
              return (
                <motion.div
                  key={sla.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
                  className="glass-card glass-card-glow rounded-2xl p-5 md:p-6"
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
                        Provider: <span className="font-mono text-[13px]" style={{ color: "var(--muted-strong)" }}>{sla.provider.slice(0, 10)}...</span>
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
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Recent Breaches */}
      {breachEvents.length > 0 && (
        <motion.div variants={fadeUp}>
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
                    <td className="px-4 py-3 font-mono" style={{ color: "var(--chainlink-light)" }}>{breach.transactionHash.slice(0, 10)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
