"use client";

import { use } from "react";
import { motion } from "framer-motion";
import { useReadContract, usePublicClient } from "wagmi";
import { formatEther, parseAbiItem } from "viem";
import { useEffect, useState } from "react";
import { SLA_CONTRACT_ADDRESS, SLA_ABI, DEPLOY_BLOCK } from "@/lib/contract";
import Link from "next/link";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

type BreachEvent = { uptimeBps: bigint; penaltyAmount: bigint; blockNumber: bigint; transactionHash: string };
type ClaimEvent = { claimId: bigint; tenant: string; blockNumber: bigint; transactionHash: string };
type WarningEvent = { riskScore: bigint; prediction: string; blockNumber: bigint };

export default function SLADetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const slaId = BigInt(id);
  const publicClient = usePublicClient();
  const [breaches, setBreaches] = useState<BreachEvent[]>([]);
  const [claims, setClaims] = useState<ClaimEvent[]>([]);
  const [warnings, setWarnings] = useState<WarningEvent[]>([]);

  const { data: slaRaw, isLoading } = useReadContract({
    address: SLA_CONTRACT_ADDRESS, abi: SLA_ABI, functionName: "slas", args: [slaId],
  });

  const { data: collateralRatio } = useReadContract({
    address: SLA_CONTRACT_ADDRESS, abi: SLA_ABI, functionName: "getCollateralRatio", args: [slaId],
  });

  useEffect(() => {
    if (!publicClient) return;
    const fetchEvents = async () => {
      const [breachLogs, claimLogs, warningLogs] = await Promise.all([
        publicClient.getLogs({
          address: SLA_CONTRACT_ADDRESS,
          event: parseAbiItem("event SLABreached(uint256 indexed slaId, address indexed provider, uint256 uptimeBps, uint256 penaltyAmount)"),
          args: { slaId }, fromBlock: DEPLOY_BLOCK, toBlock: "latest",
        }),
        publicClient.getLogs({
          address: SLA_CONTRACT_ADDRESS,
          event: parseAbiItem("event ClaimFiled(uint256 indexed claimId, uint256 indexed slaId, address tenant)"),
          args: { slaId }, fromBlock: DEPLOY_BLOCK, toBlock: "latest",
        }),
        publicClient.getLogs({
          address: SLA_CONTRACT_ADDRESS,
          event: parseAbiItem("event BreachWarning(uint256 indexed slaId, uint256 riskScore, string prediction)"),
          args: { slaId }, fromBlock: DEPLOY_BLOCK, toBlock: "latest",
        }),
      ]);
      setBreaches(breachLogs.map(log => ({
        uptimeBps: log.args.uptimeBps!, penaltyAmount: log.args.penaltyAmount!,
        blockNumber: log.blockNumber, transactionHash: log.transactionHash,
      })).reverse());
      setClaims(claimLogs.map(log => ({
        claimId: log.args.claimId!, tenant: log.args.tenant!,
        blockNumber: log.blockNumber, transactionHash: log.transactionHash,
      })).reverse());
      setWarnings(warningLogs.map(log => ({
        riskScore: log.args.riskScore!, prediction: log.args.prediction!,
        blockNumber: log.blockNumber,
      })).reverse());
    };
    fetchEvents();
  }, [publicClient, slaId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: "var(--chainlink-light)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!slaRaw) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <p style={{ color: "var(--muted)" }}>SLA #{id} not found.</p>
        <Link href="/dashboard" className="text-[13px] mt-4 block" style={{ color: "var(--chainlink-light)" }}>← Back to Dashboard</Link>
      </div>
    );
  }

  const [provider, tenant, serviceName, bondAmount, responseTimeHrs, minUptimeBps, penaltyBps, createdAt, active] = slaRaw as readonly [string, string, string, bigint, bigint, bigint, bigint, bigint, boolean];
  const bondEth = Number(formatEther(bondAmount));
  const totalSlashed = breaches.reduce((sum, b) => sum + Number(formatEther(b.penaltyAmount)), 0);

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div initial="hidden" animate="visible" className="space-y-6">
        <motion.div custom={0} variants={fadeUp} className="flex items-center gap-3">
          <Link href="/dashboard" className="text-[13px] transition-colors" style={{ color: "var(--muted)" }} onMouseEnter={e => e.currentTarget.style.color = "#fff"} onMouseLeave={e => e.currentTarget.style.color = "var(--muted)"}>← Dashboard</Link>
          <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">{serviceName || `SLA #${id}`}</h1>
          <span className="px-2.5 py-1 rounded-md text-[11px] font-medium" style={{
            color: active ? "rgba(74,222,128,0.8)" : "rgba(239,68,68,0.7)",
            background: active ? "rgba(74,222,128,0.08)" : "rgba(239,68,68,0.08)",
          }}>
            {active ? "Active" : "Inactive"}
          </span>
        </motion.div>

        {/* Details */}
        <motion.div custom={1} variants={fadeUp} className="glass-card glass-card-glow rounded-2xl p-5 md:p-6 space-y-4">
          <h2 className="text-[15px] font-semibold text-white">Agreement Details</h2>
          <div className="grid grid-cols-2 gap-4 text-[13px]">
            {[
              { label: "Service", value: serviceName || "N/A" },
              { label: "Provider", value: provider, mono: true },
              { label: "Tenant", value: tenant, mono: true },
              { label: "Bond Amount", value: `${bondEth.toFixed(4)} ETH` },
              { label: "Min Uptime", value: `${Number(minUptimeBps) / 100}%` },
              { label: "Penalty Rate", value: `${Number(penaltyBps) / 100}%` },
              { label: "Response Time", value: `${Number(responseTimeHrs)}h` },
              { label: "Created", value: new Date(Number(createdAt) * 1000).toLocaleString() },
              ...(collateralRatio !== undefined ? [{ label: "Collateral (USD)", value: `$${Number(collateralRatio).toLocaleString()}` }] : []),
            ].map(({ label, value, mono }) => (
              <div key={label}>
                <p style={{ color: "var(--muted)" }}>{label}</p>
                <p className={`text-white mt-0.5 ${mono ? "font-mono text-[11px]" : "font-medium"}`}>{value}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div custom={2} variants={fadeUp} className="grid grid-cols-3 gap-3">
          {[
            { value: breaches.length, label: "Breaches" },
            { value: totalSlashed.toFixed(4), label: "ETH Slashed" },
            { value: claims.length, label: "Claims Filed" },
          ].map(({ value, label }) => (
            <div key={label} className="glass-card rounded-2xl p-4 text-center">
              <p className="text-xl md:text-2xl font-semibold text-white">{value}</p>
              <p className="text-[12px] mt-1" style={{ color: "var(--muted)" }}>{label}</p>
            </div>
          ))}
        </motion.div>

        {/* Breach history */}
        {breaches.length > 0 && (
          <motion.div custom={3} variants={fadeUp}>
            <h2 className="text-[15px] font-semibold text-white mb-3">Breach History</h2>
            <div className="space-y-2">
              {breaches.map((b) => (
                <div key={b.transactionHash} className="glass-card rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[13px] text-white font-medium">Uptime: {Number(b.uptimeBps) / 100}%</p>
                    <p className="text-[11px] font-mono mt-0.5" style={{ color: "var(--muted)" }}>
                      Block {Number(b.blockNumber)} · {b.transactionHash.slice(0, 14)}...
                    </p>
                  </div>
                  <p className="font-mono text-[13px] text-white">{formatEther(b.penaltyAmount)} ETH</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Tribunal Verdicts */}
        {warnings.length > 0 && (
          <motion.div custom={4} variants={fadeUp}>
            <h2 className="text-[15px] font-semibold text-white mb-3">AI Tribunal History</h2>
            <div className="space-y-2">
              {warnings.map((w, i) => {
                const match = w.prediction.match(/^\[([^\]]+)\]\s*(.*)/);
                const tally = match ? match[1] : "";
                const summary = match ? match[2] : w.prediction;
                const isBreach = tally.includes("BREACH");
                const isClear = tally.includes("CLEAR");
                const penalized = breaches.length > 0;
                const votes = tally.match(/^(\d+-\d+)/)?.[1] || "";
                const label = (isBreach && penalized) ? "PENALIZED" : isBreach ? "WARNING" : isClear ? "CLEAR" : tally;
                const color = (isBreach && penalized) ? "#ef4444" : isBreach ? "#f59e0b" : "rgba(74,222,128,0.8)";
                const bg = (isBreach && penalized) ? "rgba(239,68,68,0.1)" : isBreach ? "rgba(245,158,11,0.1)" : "rgba(74,222,128,0.08)";

                return (
                  <div key={`${w.blockNumber}-${i}`} className="glass-card rounded-xl p-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className="px-2 py-0.5 rounded-md text-[11px] font-mono font-medium"
                        style={{ color, background: bg }}
                      >
                        {votes} {label}
                      </span>
                      <span className="text-[11px] font-mono" style={{ color: "var(--muted)" }}>
                        Risk: {Number(w.riskScore)} · Block {Number(w.blockNumber)}
                      </span>
                    </div>
                    <p className="text-[12px] leading-relaxed" style={{ color: "var(--muted-strong)" }}>{summary}</p>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Claims */}
        {claims.length > 0 && (
          <motion.div custom={4} variants={fadeUp}>
            <h2 className="text-[15px] font-semibold text-white mb-3">Claims Filed</h2>
            <div className="space-y-2">
              {claims.map((c) => (
                <div key={c.transactionHash} className="glass-card rounded-xl p-4">
                  <p className="text-[13px] text-white">Claim #{Number(c.claimId)}</p>
                  <p className="text-[11px] font-mono mt-0.5" style={{ color: "var(--muted)" }}>
                    Tenant: {c.tenant.slice(0, 20)}... · Block {Number(c.blockNumber)}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {breaches.length === 0 && claims.length === 0 && warnings.length === 0 && (
          <motion.p custom={3} variants={fadeUp} className="text-center py-8 text-[13px]" style={{ color: "var(--muted)" }}>
            No breach, warning, or claim events recorded for this SLA.
          </motion.p>
        )}
      </motion.div>
    </div>
  );
}
