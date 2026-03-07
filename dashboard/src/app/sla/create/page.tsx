"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { parseEther, type Address } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { SLA_CONTRACT_ADDRESS, SLA_ABI } from "@/lib/contract";
import Link from "next/link";

const SERVICE_PRESETS = [
  { label: "Cloud Hosting", defaults: { minUptime: 99.9, responseTimeHrs: 4, penaltyPct: 10 } },
  { label: "RPC Node Provider", defaults: { minUptime: 99.95, responseTimeHrs: 1, penaltyPct: 15 } },
  { label: "CDN / Edge Network", defaults: { minUptime: 99.9, responseTimeHrs: 2, penaltyPct: 8 } },
  { label: "Data Center Colocation", defaults: { minUptime: 99.99, responseTimeHrs: 24, penaltyPct: 5 } },
  { label: "API Gateway", defaults: { minUptime: 99.5, responseTimeHrs: 12, penaltyPct: 10 } },
  { label: "Custom", defaults: null },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function CreateSLA() {
  const { address, isConnected } = useAccount();
  const [form, setForm] = useState({
    tenantAddress: "" as Address | "",
    serviceName: "Cloud Hosting",
    responseTimeHrs: 4,
    minUptime: 99.9,
    penaltyPct: 10,
    bondEth: 1.0,
  });

  const { data: isVerified } = useReadContract({
    address: SLA_CONTRACT_ADDRESS,
    abi: SLA_ABI,
    functionName: "verifiedProviders",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tenantAddress) return;
    writeContract({
      address: SLA_CONTRACT_ADDRESS,
      abi: SLA_ABI,
      functionName: "createSLA",
      args: [
        form.tenantAddress as Address,
        form.serviceName,
        BigInt(form.responseTimeHrs),
        BigInt(Math.round(form.minUptime * 100)),
        BigInt(Math.round(form.penaltyPct * 100)),
      ],
      value: parseEther(form.bondEth.toString()),
    });
  };

  const isLoading = isPending || isConfirming;
  const minUptimeBps = Math.round(form.minUptime * 100);
  const penaltyBps = Math.round(form.penaltyPct * 100);

  return (
    <div className="max-w-xl mx-auto">
      <motion.div initial="hidden" animate="visible">
        <motion.div custom={0} variants={fadeUp}>
          <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight mb-1">Create SLA Agreement</h1>
          <p className="text-[14px] mb-8" style={{ color: "var(--muted)" }}>
            Define SLA terms and lock collateral. This bond will be slashed on breaches detected by the AI Tribunal.
          </p>
        </motion.div>

        {!isConnected && (
          <motion.div custom={1} variants={fadeUp} className="glass-card rounded-2xl p-6 mb-6 flex flex-col items-center gap-4">
            <p className="text-[13px]" style={{ color: "var(--muted)" }}>Connect your wallet to create an SLA</p>
            <ConnectButton />
          </motion.div>
        )}

        {isConnected && isVerified === false && (
          <motion.div custom={1} variants={fadeUp} className="glass-card rounded-2xl p-4 mb-6" style={{ borderColor: "rgba(245,158,11,0.15)" }}>
            <p className="text-[13px]" style={{ color: "var(--muted-strong)" }}>
              You must be a registered provider to create SLAs.{" "}
              <Link href="/provider/register" className="underline" style={{ color: "var(--chainlink-light)" }}>Register here</Link>.
            </p>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <motion.div
            custom={2}
            variants={fadeUp}
            className={`glass-card glass-card-glow rounded-2xl p-6 space-y-4 transition-opacity ${!isConnected || !isVerified ? "opacity-40 pointer-events-none" : ""}`}
          >
            <div>
              <label className="block text-[13px] mb-1.5" style={{ color: "var(--muted)" }}>Service Type</label>
              <div className="flex flex-wrap gap-2">
                {SERVICE_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      const updates: Record<string, unknown> = { serviceName: preset.label };
                      if (preset.defaults) Object.assign(updates, preset.defaults);
                      setForm(f => ({ ...f, ...updates }));
                    }}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                    style={{
                      background: form.serviceName === preset.label ? "rgba(55,91,210,0.2)" : "rgba(255,255,255,0.04)",
                      border: form.serviceName === preset.label ? "1px solid rgba(55,91,210,0.4)" : "1px solid var(--card-border)",
                      color: form.serviceName === preset.label ? "var(--chainlink-light)" : "var(--muted-strong)",
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {form.serviceName === "Custom" && (
              <div>
                <label className="block text-[13px] mb-1.5" style={{ color: "var(--muted)" }}>Service Name</label>
                <input
                  type="text"
                  placeholder="e.g. GPU Compute Cluster"
                  value={form.serviceName === "Custom" ? "" : form.serviceName}
                  onChange={e => setForm({ ...form, serviceName: e.target.value || "Custom" })}
                  className="w-full px-4 py-2.5 rounded-lg text-white text-[13px]"
                />
              </div>
            )}

            <div>
              <label className="block text-[13px] mb-1.5" style={{ color: "var(--muted)" }}>Tenant Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={form.tenantAddress}
                onChange={e => setForm({ ...form, tenantAddress: e.target.value as Address })}
                className="w-full px-4 py-2.5 rounded-lg text-white font-mono text-[13px]"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Response Time (hours)", value: form.responseTimeHrs, key: "responseTimeHrs", min: 1, max: 168, step: 1 },
                { label: "Collateral Bond (ETH)", value: form.bondEth, key: "bondEth", min: 0.1, step: 0.1 },
                { label: "Min Uptime (%)", value: form.minUptime, key: "minUptime", min: 90, max: 100, step: 0.1 },
                { label: "Penalty per Breach (%)", value: form.penaltyPct, key: "penaltyPct", min: 1, max: 100, step: 0.5 },
              ].map(({ label, value, key, ...rest }) => (
                <div key={key}>
                  <label className="block text-[13px] mb-1.5" style={{ color: "var(--muted)" }}>{label}</label>
                  <input
                    type="number"
                    value={value}
                    onChange={e => setForm({ ...form, [key]: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2.5 rounded-lg text-white text-[14px]"
                    {...rest}
                  />
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="bordered-box p-4 rounded-xl text-[13px] space-y-1.5" style={{ background: "rgba(255,255,255,0.02)" }}>
              <p className="font-medium mb-2 text-white text-[12px] uppercase tracking-wider">Agreement Summary</p>
              <p style={{ color: "var(--muted-strong)" }}>Uptime threshold: <span className="text-white">{minUptimeBps} bps ({form.minUptime}%)</span></p>
              <p style={{ color: "var(--muted-strong)" }}>Penalty on breach: <span className="text-white">{penaltyBps} bps ({form.penaltyPct}% of bond)</span></p>
              <p style={{ color: "var(--muted-strong)" }}>Collateral at risk: <span className="text-white">{(form.bondEth * form.penaltyPct / 100).toFixed(3)} ETH per breach</span></p>
            </div>
          </motion.div>

          <motion.div custom={3} variants={fadeUp}>
            <button
              type="submit"
              disabled={!isConnected || !isVerified || isLoading}
              className="btn-primary w-full py-3 text-[14px]"
            >
              {isLoading ? "Creating SLA..." : isSuccess ? "✓ SLA Created!" : "Create SLA & Bond Collateral"}
            </button>
          </motion.div>

          {txHash && !isSuccess && (
            <p className="text-[12px] text-center font-mono" style={{ color: "var(--muted)" }}>
              Tx: {txHash.slice(0, 20)}... confirming...
            </p>
          )}

          {isSuccess && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-xl p-4" style={{ borderColor: "rgba(74,222,128,0.15)" }}>
              <p className="font-medium text-white text-[14px]">SLA created on-chain!</p>
              <p className="text-[12px] mt-1" style={{ color: "var(--muted)" }}>Chainlink CRE will now monitor compliance automatically.</p>
              <p className="text-[12px] mt-1 font-mono" style={{ color: "var(--muted)" }}>
                Tx: <a href={`${process.env.NEXT_PUBLIC_TENDERLY_EXPLORER}/tx/${txHash}`} target="_blank" rel="noreferrer" className="underline">{txHash?.slice(0, 20)}...</a>
              </p>
            </motion.div>
          )}

          {error && <p className="text-red-400 text-[13px]">{error.message.split("\n")[0]}</p>}
        </form>
      </motion.div>
    </div>
  );
}
