"use client";

import { useState } from "react";
import { motion } from "framer-motion";

export default function CreateSLA() {
  const [form, setForm] = useState({
    tenantAddress: "",
    responseTimeHrs: 48,
    minUptime: 99.5,
    penaltyPct: 5,
    bondEth: 1.0,
  });
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxStatus("pending");

    try {
      // In production: ethers.js contract call
      await new Promise(resolve => setTimeout(resolve, 2000));
      setTxStatus("success");
    } catch {
      setTxStatus("error");
    }
  };

  const minUptimeBps = Math.round(form.minUptime * 100);
  const penaltyBps = Math.round(form.penaltyPct * 100);

  return (
    <div className="max-w-xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-white mb-2">Create SLA Agreement</h1>
        <p className="text-gray-400 mb-8">Define terms and bond collateral. CRE will automatically enforce violations.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl p-6 border space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Tenant Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={form.tenantAddress}
                onChange={e => setForm({ ...form, tenantAddress: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border text-white bg-transparent focus:outline-none font-mono text-sm"
                style={{ borderColor: 'var(--card-border)' }}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Response Time (hours)</label>
                <input
                  type="number"
                  value={form.responseTimeHrs}
                  onChange={e => setForm({ ...form, responseTimeHrs: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 rounded-lg border text-white bg-transparent focus:outline-none"
                  style={{ borderColor: 'var(--card-border)' }}
                  min="1" max="168"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Bond Amount (ETH)</label>
                <input
                  type="number"
                  value={form.bondEth}
                  onChange={e => setForm({ ...form, bondEth: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 rounded-lg border text-white bg-transparent focus:outline-none"
                  style={{ borderColor: 'var(--card-border)' }}
                  min="0.1" step="0.1"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Min Uptime (%)</label>
                <input
                  type="number"
                  value={form.minUptime}
                  onChange={e => setForm({ ...form, minUptime: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 rounded-lg border text-white bg-transparent focus:outline-none"
                  style={{ borderColor: 'var(--card-border)' }}
                  min="90" max="100" step="0.1"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Penalty per Breach (%)</label>
                <input
                  type="number"
                  value={form.penaltyPct}
                  onChange={e => setForm({ ...form, penaltyPct: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 rounded-lg border text-white bg-transparent focus:outline-none"
                  style={{ borderColor: 'var(--card-border)' }}
                  min="1" max="100" step="0.5"
                />
              </div>
            </div>

            {/* Summary */}
            <div className="p-4 rounded-lg text-sm space-y-1" style={{ background: '#0d0d1a' }}>
              <p className="text-gray-400 font-medium mb-2">Agreement Summary</p>
              <p className="text-gray-300">Uptime threshold: <span className="text-white">{minUptimeBps} bps ({form.minUptime}%)</span></p>
              <p className="text-gray-300">Penalty on breach: <span className="text-orange-400">{penaltyBps} bps ({form.penaltyPct}% of bond)</span></p>
              <p className="text-gray-300">Collateral at risk: <span className="text-red-400">{(form.bondEth * form.penaltyPct / 100).toFixed(3)} ETH per breach</span></p>
            </div>
          </div>

          <button
            type="submit"
            disabled={txStatus === "pending"}
            className="w-full py-3 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: 'var(--chainlink-blue)' }}
          >
            {txStatus === "pending" ? "Creating SLA..." : "Create SLA & Bond Collateral"}
          </button>

          {txStatus === "success" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-lg text-green-400 border border-green-400/20 bg-green-400/5"
            >
              SLA created! Chainlink CRE will now monitor compliance automatically.
            </motion.div>
          )}
        </form>
      </motion.div>
    </div>
  );
}
