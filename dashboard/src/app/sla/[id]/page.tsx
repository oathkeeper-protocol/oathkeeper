"use client";

import { use } from "react";
import { motion } from "framer-motion";
import { formatEther } from "viem";
import { useSLADetail } from "@/hooks/usePonderData";
import { useReadContract } from "wagmi";
import { SLA_CONTRACT_ADDRESS, SLA_ABI } from "@/lib/contract";
import Link from "next/link";
import { AgentVerdictList } from "@/components/TribunalVerdicts";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function SLADetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { sla: slaData, breaches, warnings, claims, isLoading } = useSLADetail(id);

  const { data: collateralRatio } = useReadContract({
    address: SLA_CONTRACT_ADDRESS, abi: SLA_ABI, functionName: "getCollateralRatio", args: [BigInt(id)],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: "var(--chainlink-light)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!slaData) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <p style={{ color: "var(--muted)" }}>SLA #{id} not found.</p>
        <Link href="/dashboard" className="text-[13px] mt-4 block" style={{ color: "var(--chainlink-light)" }}>← Back to Dashboard</Link>
      </div>
    );
  }

  const { provider, tenant, serviceName, bondAmount, responseTimeHrs, minUptimeBps, penaltyBps, active, createdAt } = slaData;
  const bondEth = Number(bondAmount) / 1e18;
  const totalSlashed = breaches.reduce((sum, b) => sum + Number(b.penaltyAmount) / 1e18, 0);

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
              { label: "Created", value: createdAt ? new Date(Number(createdAt)).toLocaleString() : "N/A" },
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
                      Block {b.blockNumber} · {b.transactionHash.slice(0, 14)}...
                    </p>
                  </div>
                  <p className="font-mono text-[13px] text-white">{formatEther(BigInt(b.penaltyAmount))} ETH</p>
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
                const tally = w.tally || "";
                const summary = w.summary || w.prediction;
                const isBreach = tally.includes("BREACH");
                const isWarning = tally.includes("WARNING");
                const isClear = tally.includes("CLEAR");
                // Check if this specific verdict led to a breach (same block or next block)
                const penalized = w.penalized || breaches.some(b => Math.abs(Number(b.blockNumber) - Number(w.blockNumber)) <= 1);
                const votes = tally.match(/^(\d+-\d+)/)?.[1] || "";
                const label = penalized ? "PENALIZED" : isBreach ? "BREACH" : isWarning ? "WARNING" : isClear ? "CLEAR" : "ASSESSED";
                const color = penalized ? "#ef4444" : isBreach ? "#ef4444" : isWarning ? "#f59e0b" : "rgba(74,222,128,0.8)";
                const bg = penalized ? "rgba(239,68,68,0.1)" : isBreach ? "rgba(239,68,68,0.1)" : isWarning ? "rgba(245,158,11,0.1)" : "rgba(74,222,128,0.08)";

                return (
                  <div key={`${w.blockNumber}-${i}`} className="glass-card rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="px-2 py-0.5 rounded-md text-[11px] font-mono font-medium"
                          style={{ color, background: bg }}
                        >
                          {votes} {label}
                        </span>
                        <span className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>Block {w.blockNumber}</span>
                      </div>
                      <span className="text-[11px] font-mono" style={{ color: "var(--muted)" }}>
                        Risk: {w.riskScore}
                      </span>
                    </div>
                    <AgentVerdictList summary={summary} />
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
                  <p className="text-[13px] text-white">Claim #{c.claimId}</p>
                  <p className="text-[11px] font-mono mt-0.5" style={{ color: "var(--muted)" }}>
                    Tenant: {c.tenant.slice(0, 20)}... · Block {c.blockNumber}
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
