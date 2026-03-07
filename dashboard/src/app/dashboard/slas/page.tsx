"use client";

import { useReadContract, useReadContracts, usePublicClient } from "wagmi";
import { formatEther, parseAbiItem } from "viem";
import { useEffect, useState } from "react";
import { SLA_CONTRACT_ADDRESS, SLA_ABI, DEPLOY_BLOCK } from "@/lib/contract";
import Link from "next/link";

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

type BreachWarningEvent = { slaId: bigint; riskScore: bigint; blockNumber: bigint };

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

function BondHealthBar({ bond, max }: { bond: number; max: number }) {
  const pct = max > 0 ? Math.min((bond / max) * 100, 100) : 0;
  return (
    <div className="mt-3">
      <div className="flex justify-between text-[12px] mb-1.5" style={{ color: "var(--muted)" }}>
        <span>Bond Health</span>
        <span className="text-white font-medium">{bond.toFixed(4)} ETH</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: "var(--chainlink-blue)" }} />
      </div>
    </div>
  );
}

export default function AllSLAs() {
  const publicClient = usePublicClient();

  const { data: slaCount } = useReadContract({
    address: SLA_CONTRACT_ADDRESS, abi: SLA_ABI, functionName: "slaCount",
  });

  const slaIds = Array.from({ length: Number(slaCount ?? 0) }, (_, i) => i);
  const { data: slaResults } = useReadContracts({
    contracts: slaIds.map(id => ({
      address: SLA_CONTRACT_ADDRESS, abi: SLA_ABI, functionName: "slas" as const, args: [BigInt(id)] as const,
    })),
  });

  const slas: SLAData[] = (slaResults ?? []).map((result, i) => {
    if (result.status !== "success" || !result.result) return null;
    const r = result.result as readonly [string, string, string, bigint, bigint, bigint, bigint, bigint, boolean];
    return { id: i, provider: r[0], tenant: r[1], serviceName: r[2], bondAmount: r[3], responseTimeHrs: r[4], minUptimeBps: r[5], penaltyBps: r[6], createdAt: r[7], active: r[8] };
  }).filter(Boolean) as SLAData[];

  const [warnings, setWarnings] = useState<BreachWarningEvent[]>([]);

  useEffect(() => {
    if (!publicClient) return;
    publicClient.getLogs({
      address: SLA_CONTRACT_ADDRESS,
      event: parseAbiItem("event BreachWarning(uint256 indexed slaId, uint256 riskScore, string prediction)"),
      fromBlock: DEPLOY_BLOCK, toBlock: "latest",
    }).then(logs => setWarnings(logs.map(l => ({ slaId: l.args.slaId!, riskScore: l.args.riskScore!, blockNumber: l.blockNumber }))));
  }, [publicClient]);

  const latestRisk = new Map<number, number>();
  for (const w of [...warnings].sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber))) {
    const id = Number(w.slaId);
    if (!latestRisk.has(id)) latestRisk.set(id, Number(w.riskScore));
  }

  const slasSorted = [...slas].reverse();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-[13px] transition-colors" style={{ color: "var(--muted)" }}>← Dashboard</Link>
        <h1 className="text-2xl font-semibold text-white tracking-tight">All SLA Agreements</h1>
        <span className="text-[13px] font-mono" style={{ color: "var(--muted)" }}>{slas.length} total</span>
      </div>
      <div className="space-y-3">
        {slasSorted.map((sla) => {
          const riskScore = latestRisk.get(sla.id);
          return (
            <div key={sla.id} className="glass-card glass-card-glow rounded-2xl p-5">
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
                    Min uptime: {Number(sla.minUptimeBps) / 100}% · Response: {Number(sla.responseTimeHrs)}h · Penalty: {Number(sla.penaltyBps) / 100}%
                  </p>
                </div>
                <Link href={`/sla/${sla.id}`} className="btn-primary px-4 py-2 text-[13px]">View</Link>
              </div>
              <BondHealthBar bond={Number(formatEther(sla.bondAmount))} max={3} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
