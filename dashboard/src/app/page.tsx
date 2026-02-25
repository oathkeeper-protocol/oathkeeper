"use client";

import { motion } from "framer-motion";
import { ComplianceChart } from "@/components/ComplianceChart";
import { MOCK_SLAS, MOCK_BREACHES } from "@/lib/contract";

function StatCard({ label, value, subtitle, color }: { label: string; value: string; subtitle?: string; color?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl p-6 border"
      style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
    >
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-3xl font-bold mt-1" style={{ color: color || 'white' }}>{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </motion.div>
  );
}

function BondHealthBar({ bond, max }: { bond: number; max: number }) {
  const pct = Math.min((bond / max) * 100, 100);
  const color = pct > 66 ? '#22c55e' : pct > 33 ? '#f59e0b' : '#ef4444';
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>Bond Health</span>
        <span>{bond} ETH</span>
      </div>
      <div className="h-2 rounded-full bg-gray-700">
        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const activeSLAs = MOCK_SLAS.filter(s => s.active).length;
  const totalBonded = MOCK_SLAS.reduce((sum, s) => sum + parseFloat(s.bondAmount), 0);
  const breachCount = MOCK_BREACHES.length;
  const avgUptime = 99.6;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">SLA Dashboard</h1>
        <p className="text-gray-400 mt-1">Real-time compliance monitoring for tokenized RWA service agreements</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Active SLAs" value={`${activeSLAs}`} subtitle="agreements enforced" color="#5493F7" />
        <StatCard label="Total Bonded" value={`${totalBonded} ETH`} subtitle="locked as collateral" color="#22c55e" />
        <StatCard label="Avg Uptime" value={`${avgUptime}%`} subtitle="last 24 hours" color="#5493F7" />
        <StatCard label="Breaches (24h)" value={`${breachCount}`} subtitle="penalties executed" color={breachCount > 0 ? '#ef4444' : '#22c55e'} />
      </div>

      {/* SLA Cards */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">Active Agreements</h2>
        <div className="space-y-4">
          {MOCK_SLAS.map((sla, i) => (
            <motion.div
              key={sla.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="rounded-xl p-6 border"
              style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-gray-400">SLA #{sla.id}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium text-green-400 bg-green-400/10">
                      Active
                    </span>
                  </div>
                  <p className="text-white font-medium mt-1">
                    Provider: <span className="font-mono text-sm text-gray-300">{sla.provider.slice(0, 10)}...</span>
                  </p>
                  <p className="text-gray-400 text-sm">
                    Min uptime: {sla.minUptimeBps / 100}% &middot; Response: {sla.responseTimeHrs}h &middot; Penalty: {sla.penaltyBps / 100}%
                  </p>
                </div>
                <a
                  href={`/sla/${sla.id}`}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                  style={{ background: 'var(--chainlink-blue)' }}
                >
                  View Details
                </a>
              </div>
              <ComplianceChart data={sla.complianceHistory} threshold={sla.minUptimeBps} />
              <BondHealthBar bond={parseFloat(sla.bondAmount)} max={3} />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Recent Breaches */}
      {MOCK_BREACHES.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-white mb-4">Recent Breaches</h2>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--card-border)' }}>
            <table className="w-full text-sm">
              <thead style={{ background: 'var(--card)' }}>
                <tr className="text-gray-400 text-left">
                  <th className="px-4 py-3">SLA</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Uptime</th>
                  <th className="px-4 py-3">Penalty</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Tx</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_BREACHES.map((breach, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: 'var(--card-border)', background: i % 2 === 0 ? '#0d0d1a' : 'var(--card)' }}>
                    <td className="px-4 py-3 text-white font-mono">#{breach.slaId}</td>
                    <td className="px-4 py-3 text-gray-300 font-mono">{breach.provider}</td>
                    <td className="px-4 py-3 text-red-400">{breach.uptimeBps / 100}%</td>
                    <td className="px-4 py-3 text-orange-400">{breach.penaltyAmount} ETH</td>
                    <td className="px-4 py-3 text-gray-400">{new Date(breach.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-blue-400 hover:underline cursor-pointer">{breach.txHash}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
