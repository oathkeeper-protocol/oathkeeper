"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import { SLA_CONTRACT_ADDRESS, DEPLOY_BLOCK } from "@/lib/contract";
import Link from "next/link";

type BreachWarningEvent = { slaId: bigint; riskScore: bigint; prediction: string; blockNumber: bigint };

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

export default function AllPredictions() {
  const publicClient = usePublicClient();
  const [warnings, setWarnings] = useState<BreachWarningEvent[]>([]);

  useEffect(() => {
    if (!publicClient) return;
    publicClient.getLogs({
      address: SLA_CONTRACT_ADDRESS,
      event: parseAbiItem("event BreachWarning(uint256 indexed slaId, uint256 riskScore, string prediction)"),
      fromBlock: DEPLOY_BLOCK, toBlock: "latest",
    }).then(logs => setWarnings(
      logs.map(l => ({ slaId: l.args.slaId!, riskScore: l.args.riskScore!, prediction: l.args.prediction!, blockNumber: l.blockNumber }))
        .sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber))
    ));
  }, [publicClient]);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-[13px] transition-colors" style={{ color: "var(--muted)" }}>← Dashboard</Link>
        <h1 className="text-2xl font-semibold text-white tracking-tight">AI Tribunal History</h1>
      </div>
      {warnings.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <p style={{ color: "var(--muted)" }}>No tribunal verdicts recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {warnings.map((w, i) => {
            const { tally, summary } = parseTribunalPrediction(w.prediction);
            return (
              <div
                key={`${w.slaId}-${w.blockNumber}-${i}`}
                className="glass-card rounded-xl p-4"
                style={{ borderColor: Number(w.riskScore) > 70 ? "rgba(239,68,68,0.15)" : undefined }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px]" style={{ color: "var(--muted)" }}>SLA #{Number(w.slaId)}</span>
                    <span className="text-[11px]" style={{ color: "var(--muted)" }}>Block {Number(w.blockNumber)}</span>
                  </div>
                  <RiskBadge score={Number(w.riskScore)} />
                </div>
                {tally && (
                  <div className="mb-1.5">
                    <TribunalBadge tally={tally} />
                  </div>
                )}
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--muted-strong)" }}>{summary}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
