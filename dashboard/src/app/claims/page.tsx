"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatEther } from "viem";
import { SLA_CONTRACT_ADDRESS, SLA_ABI } from "@/lib/contract";
import { useTenantData } from "@/hooks/usePonderData";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function Claims() {
  const { address, isConnected } = useAccount();
  const { slas, breaches, claims, claimedBreachSlaIds, isLoading, error } = useTenantData(address);
  const [claimForm, setClaimForm] = useState({ slaId: "", description: "" });

  const { writeContract, data: txHash, isPending, error: txError, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    writeContract({
      address: SLA_CONTRACT_ADDRESS,
      abi: SLA_ABI,
      functionName: "fileClaim",
      args: [BigInt(claimForm.slaId), claimForm.description],
    });
  };

  const fileClaim = (slaId: string) => {
    setClaimForm({ slaId, description: `Breach detected on SLA #${slaId} — requesting penalty enforcement` });
  };

  const isTxLoading = isPending || isConfirming;
  const totalPenalties = breaches.reduce((sum, b) => sum + Number(b.penaltyAmount) / 1e18, 0);

  return (
    <div className="max-w-4xl mx-auto">
      <motion.div initial="hidden" animate="visible" className="space-y-8">
        <motion.div custom={0} variants={fadeUp}>
          <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight mb-1">Claims</h1>
          <p className="text-[14px]" style={{ color: "var(--muted)" }}>
            View breaches on your SLAs and file claims to trigger penalty enforcement.
          </p>
        </motion.div>

        {!isConnected ? (
          <motion.div custom={1} variants={fadeUp} className="glass-card glass-card-glow rounded-2xl p-8 text-center">
            <p className="text-[14px] mb-4" style={{ color: "var(--muted)" }}>Connect your tenant wallet to view your SLAs and file claims.</p>
            <ConnectButton />
          </motion.div>
        ) : isLoading ? (
          <motion.div custom={1} variants={fadeUp} className="text-center py-12">
            <div className="inline-block w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </motion.div>
        ) : error ? (
          <motion.div custom={1} variants={fadeUp} className="glass-card rounded-2xl p-6">
            <p className="text-red-400 text-[13px]">Ponder error: {error}</p>
          </motion.div>
        ) : slas.length === 0 ? (
          <motion.div custom={1} variants={fadeUp} className="glass-card glass-card-glow rounded-2xl p-8 text-center">
            <p className="text-[15px] text-white mb-2">No SLAs found for this wallet</p>
            <p className="text-[13px]" style={{ color: "var(--muted)" }}>
              You are not a tenant on any active SLA. SLAs are created by providers with your address as tenant.
            </p>
          </motion.div>
        ) : (
          <>
            {/* Stats */}
            <motion.div custom={1} variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Your SLAs", value: slas.length },
                { label: "Total Breaches", value: breaches.length },
                { label: "Claims Filed", value: claims.length },
                { label: "Penalties Received", value: `${totalPenalties.toFixed(4)} ETH` },
              ].map((stat) => (
                <div key={stat.label} className="glass-card rounded-xl p-4">
                  <p className="text-[11px] font-medium mb-1" style={{ color: "var(--muted)" }}>{stat.label}</p>
                  <p className="text-white text-[20px] font-semibold">{stat.value}</p>
                </div>
              ))}
            </motion.div>

            {/* Your SLAs */}
            <motion.div custom={2} variants={fadeUp}>
              <h2 className="text-[15px] font-semibold text-white mb-3">Your SLA Agreements</h2>
              <div className="space-y-3">
                {slas.map((sla) => {
                  const slaBreaches = breaches.filter(b => b.slaId === sla.slaId);
                  const hasClaim = claimedBreachSlaIds.has(sla.slaId);
                  const hasUnclaimedBreach = slaBreaches.length > 0 && !hasClaim;

                  return (
                    <div
                      key={sla.id}
                      className="glass-card rounded-xl p-4"
                      style={hasUnclaimedBreach ? { border: "1px solid rgba(239,68,68,0.3)" } : undefined}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-white text-[14px] font-medium">SLA #{sla.slaId}</span>
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                              style={{
                                background: sla.active ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)",
                                color: sla.active ? "rgba(74,222,128,0.8)" : "rgba(239,68,68,0.7)",
                              }}
                            >
                              {sla.active ? "Active" : "Inactive"}
                            </span>
                            {hasUnclaimedBreach && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                                style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
                              >
                                BREACHED
                              </span>
                            )}
                            {hasClaim && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                                style={{ background: "rgba(55,91,210,0.1)", color: "var(--chainlink-light)" }}
                              >
                                CLAIMED
                              </span>
                            )}
                          </div>
                          <p className="text-[13px] text-white">{sla.serviceName}</p>
                          <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
                            Min uptime: {Number(sla.minUptimeBps) / 100}% &middot; Penalty: {Number(sla.penaltyBps) / 100}% &middot; Bond: {(Number(sla.bondAmount) / 1e18).toFixed(4)} ETH
                          </p>
                          {slaBreaches.length > 0 && (
                            <p className="text-[11px] mt-1" style={{ color: "rgba(239,68,68,0.7)" }}>
                              {slaBreaches.length} breach{slaBreaches.length > 1 ? "es" : ""} &middot; {slaBreaches.reduce((s, b) => s + Number(b.penaltyAmount) / 1e18, 0).toFixed(4)} ETH penalized
                            </p>
                          )}
                        </div>
                        {hasUnclaimedBreach && (
                          <button
                            onClick={() => fileClaim(sla.slaId)}
                            className="shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}
                          >
                            File Claim
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* File Claim Form */}
            {claimForm.slaId && (
              <motion.div
                custom={3}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className="glass-card glass-card-glow rounded-2xl p-6"
              >
                <h2 className="text-[15px] font-semibold text-white mb-4">File Claim — SLA #{claimForm.slaId}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[13px] mb-1.5" style={{ color: "var(--muted)" }}>Description</label>
                    <textarea
                      value={claimForm.description}
                      onChange={e => setClaimForm({ ...claimForm, description: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2.5 rounded-lg text-white text-[14px] resize-none"
                      required
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="submit" disabled={isTxLoading} className="btn-primary px-6 py-2.5 text-[14px]">
                      {isTxLoading ? "Submitting..." : "Submit Claim On-Chain"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setClaimForm({ slaId: "", description: "" }); reset(); }}
                      className="px-4 py-2.5 rounded-lg text-[13px] transition-colors"
                      style={{ color: "var(--muted)", border: "1px solid var(--card-border)" }}
                    >
                      Cancel
                    </button>
                  </div>
                  {txHash && !isSuccess && (
                    <p className="text-[12px] font-mono" style={{ color: "var(--muted)" }}>Tx: {txHash.slice(0, 20)}... confirming...</p>
                  )}
                  {isSuccess && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[13px]" style={{ color: "rgba(74,222,128,0.8)" }}>
                      Claim filed on-chain successfully.
                    </motion.p>
                  )}
                  {txError && <p className="text-red-400 text-[13px]">{txError.message.split("\n")[0]}</p>}
                </form>
              </motion.div>
            )}

            {/* Recent Breaches */}
            <motion.div custom={4} variants={fadeUp}>
              <h2 className="text-[15px] font-semibold text-white mb-3">Breach History</h2>
              {breaches.length === 0 ? (
                <p className="text-[13px]" style={{ color: "var(--muted)" }}>No breaches detected on your SLAs yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr style={{ color: "var(--muted)" }}>
                        <th className="text-left py-2 font-medium">SLA</th>
                        <th className="text-left py-2 font-medium">Uptime</th>
                        <th className="text-left py-2 font-medium">Penalty</th>
                        <th className="text-left py-2 font-medium">Status</th>
                        <th className="text-left py-2 font-medium">Tx</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breaches.map((b) => (
                        <tr key={b.id} className="border-t" style={{ borderColor: "var(--card-border)" }}>
                          <td className="py-3 text-white font-medium">#{b.slaId}</td>
                          <td className="py-3" style={{ color: "rgba(239,68,68,0.7)" }}>{(Number(b.uptimeBps) / 100).toFixed(1)}%</td>
                          <td className="py-3 text-white">{(Number(b.penaltyAmount) / 1e18).toFixed(4)} ETH</td>
                          <td className="py-3">
                            {claimedBreachSlaIds.has(b.slaId) ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: "rgba(55,91,210,0.1)", color: "var(--chainlink-light)" }}>Claimed</span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>Unclaimed</span>
                            )}
                          </td>
                          <td className="py-3">
                            <a
                              href={`${process.env.NEXT_PUBLIC_TENDERLY_EXPLORER}/tx/${b.transactionHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-[11px] underline"
                              style={{ color: "var(--muted)" }}
                            >
                              {b.transactionHash.slice(0, 10)}...
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>

            {/* Filed Claims */}
            {claims.length > 0 && (
              <motion.div custom={5} variants={fadeUp}>
                <h2 className="text-[15px] font-semibold text-white mb-3">Your Claims</h2>
                <div className="space-y-2">
                  {claims.map((c) => (
                    <div key={c.id} className="glass-card rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="text-white text-[13px] font-medium">Claim #{c.claimId} — SLA #{c.slaId}</p>
                        <p className="text-[11px] font-mono mt-0.5" style={{ color: "var(--muted)" }}>
                          Block {c.blockNumber}
                        </p>
                      </div>
                      <a
                        href={`${process.env.NEXT_PUBLIC_TENDERLY_EXPLORER}/tx/${c.transactionHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-mono underline"
                        style={{ color: "var(--muted)" }}
                      >
                        {c.transactionHash.slice(0, 10)}...
                      </a>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
