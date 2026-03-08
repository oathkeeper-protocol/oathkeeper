"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAccount } from "wagmi";
import { useSearchParams } from "next/navigation";
import { useTenantData } from "@/hooks/usePonderData";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function Claims() {
  const { address } = useAccount();
  const searchParams = useSearchParams();
  const paramTenant = searchParams.get("tenant");

  // Use URL param if provided, otherwise connected wallet
  const [tenantInput, setTenantInput] = useState("");
  const activeTenant = paramTenant || tenantInput || address;

  useEffect(() => {
    if (paramTenant) setTenantInput(paramTenant);
  }, [paramTenant]);

  const { slas, breaches, claims, claimedBreachSlaIds, isLoading, error } = useTenantData(activeTenant);

  const totalPenalties = breaches.reduce((sum, b) => sum + Number(b.penaltyAmount) / 1e18, 0);

  return (
    <div className="max-w-4xl mx-auto">
      <motion.div initial="hidden" animate="visible" className="space-y-8">
        <motion.div custom={0} variants={fadeUp}>
          <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight mb-1">Tenant View</h1>
          <p className="text-[14px]" style={{ color: "var(--muted)" }}>
            View SLA agreements, breach history, and penalty payouts for a tenant address.
          </p>
        </motion.div>

        {/* Tenant address input */}
        <motion.div custom={1} variants={fadeUp} className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-3">
            <label className="text-[12px] font-medium shrink-0" style={{ color: "var(--muted)" }}>Tenant</label>
            <input
              type="text"
              value={tenantInput || activeTenant || ""}
              onChange={e => setTenantInput(e.target.value)}
              placeholder="0x... (or connect wallet)"
              className="flex-1 py-2 px-3 rounded-lg text-[13px] font-mono text-white bg-transparent outline-none"
              style={{ border: "1px solid var(--card-border)" }}
            />
          </div>
          {activeTenant && (
            <p className="text-[11px] font-mono mt-2" style={{ color: "var(--muted)" }}>
              Viewing: {activeTenant}
            </p>
          )}
        </motion.div>

        {!activeTenant ? (
          <motion.div custom={2} variants={fadeUp} className="glass-card glass-card-glow rounded-2xl p-8 text-center">
            <p className="text-[14px]" style={{ color: "var(--muted)" }}>Enter a tenant address or connect a wallet to view SLAs.</p>
          </motion.div>
        ) : isLoading ? (
          <motion.div custom={2} variants={fadeUp} className="text-center py-12">
            <div className="inline-block w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </motion.div>
        ) : error ? (
          <motion.div custom={2} variants={fadeUp} className="glass-card rounded-2xl p-6">
            <p className="text-red-400 text-[13px]">Ponder error: {error}</p>
          </motion.div>
        ) : slas.length === 0 ? (
          <motion.div custom={2} variants={fadeUp} className="glass-card glass-card-glow rounded-2xl p-8 text-center">
            <p className="text-[15px] text-white mb-2">No SLAs found</p>
            <p className="text-[13px]" style={{ color: "var(--muted)" }}>
              This address is not a tenant on any SLA.
            </p>
          </motion.div>
        ) : (
          <>
            {/* Stats */}
            <motion.div custom={2} variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "SLA Agreements", value: slas.length },
                { label: "Breaches Detected", value: breaches.length },
                { label: "Penalties Received", value: `${totalPenalties.toFixed(4)} ETH` },
                { label: "Claims Filed", value: claims.length },
              ].map((stat) => (
                <div key={stat.label} className="glass-card rounded-xl p-4">
                  <p className="text-[11px] font-medium mb-1" style={{ color: "var(--muted)" }}>{stat.label}</p>
                  <p className="text-white text-[20px] font-semibold">{stat.value}</p>
                </div>
              ))}
            </motion.div>

            {/* SLA Agreements */}
            <motion.div custom={3} variants={fadeUp}>
              <h2 className="text-[15px] font-semibold text-white mb-3">SLA Agreements</h2>
              <div className="space-y-3">
                {slas.map((sla) => {
                  const slaBreaches = breaches.filter(b => b.slaId === sla.slaId);
                  const hasBreach = slaBreaches.length > 0;
                  const slaPenalties = slaBreaches.reduce((s, b) => s + Number(b.penaltyAmount) / 1e18, 0);

                  return (
                    <div
                      key={sla.id}
                      className="glass-card rounded-xl p-4"
                      style={hasBreach ? { border: "1px solid rgba(239,68,68,0.3)" } : undefined}
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
                            {hasBreach && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                                style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
                              >
                                {slaBreaches.length} BREACH{slaBreaches.length > 1 ? "ES" : ""}
                              </span>
                            )}
                          </div>
                          <p className="text-[13px] text-white">{sla.serviceName}</p>
                          <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
                            Provider: {sla.provider.slice(0, 10)}... &middot; Min uptime: {Number(sla.minUptimeBps) / 100}% &middot; Penalty: {Number(sla.penaltyBps) / 100}%
                          </p>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-[12px]" style={{ color: "var(--muted)" }}>
                              Bond: <span className="text-white font-mono">{(Number(sla.bondAmount) / 1e18).toFixed(4)} ETH</span>
                            </span>
                            {hasBreach && (
                              <span className="text-[12px]" style={{ color: "rgba(74,222,128,0.8)" }}>
                                Penalties paid: <span className="font-mono">{slaPenalties.toFixed(4)} ETH</span>
                              </span>
                            )}
                          </div>
                        </div>
                        {sla.latestRiskScore !== null && sla.latestRiskScore > 0 && (
                          <div
                            className="shrink-0 px-2 py-1 rounded-lg text-[11px] font-medium"
                            style={{
                              background: sla.latestRiskScore >= 70 ? "rgba(239,68,68,0.1)" : sla.latestRiskScore >= 50 ? "rgba(245,158,11,0.1)" : "rgba(74,222,128,0.1)",
                              color: sla.latestRiskScore >= 70 ? "#ef4444" : sla.latestRiskScore >= 50 ? "#f59e0b" : "rgba(74,222,128,0.8)",
                            }}
                          >
                            Risk: {sla.latestRiskScore}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* Breach History */}
            {breaches.length > 0 && (
              <motion.div custom={4} variants={fadeUp}>
                <h2 className="text-[15px] font-semibold text-white mb-3">Breach History</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr style={{ color: "var(--muted)" }}>
                        <th className="text-left py-2 font-medium">SLA</th>
                        <th className="text-left py-2 font-medium">Uptime</th>
                        <th className="text-left py-2 font-medium">Penalty</th>
                        <th className="text-left py-2 font-medium">Block</th>
                        <th className="text-left py-2 font-medium">Tx</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breaches.map((b) => (
                        <tr key={b.id} className="border-t" style={{ borderColor: "var(--card-border)" }}>
                          <td className="py-3 text-white font-medium">#{b.slaId}</td>
                          <td className="py-3" style={{ color: "rgba(239,68,68,0.7)" }}>{(Number(b.uptimeBps) / 100).toFixed(1)}%</td>
                          <td className="py-3 text-white">{(Number(b.penaltyAmount) / 1e18).toFixed(4)} ETH</td>
                          <td className="py-3 font-mono" style={{ color: "var(--muted)" }}>{b.blockNumber}</td>
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
              </motion.div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
