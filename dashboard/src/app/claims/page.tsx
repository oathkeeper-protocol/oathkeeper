"use client";

import { useState } from "react";
import { motion } from "framer-motion";

const MOCK_CLAIMS = [
  { id: 0, slaId: 0, description: "Plumbing leak in unit 4B — no response in 72hrs", filedAt: "2026-02-24T14:30:00Z", resolved: false },
  { id: 1, slaId: 1, description: "HVAC failure — maintenance required", filedAt: "2026-02-25T09:00:00Z", resolved: true },
];

export default function Claims() {
  const [form, setForm] = useState({ slaId: "0", description: "" });
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "success">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxStatus("pending");
    await new Promise(r => setTimeout(r, 1500));
    setTxStatus("success");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Claims</h1>
        <p className="text-gray-400">File maintenance claims against active SLAs. CRE monitors response times.</p>
      </div>

      {/* File new claim */}
      <div className="rounded-xl p-6 border" style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
        <h2 className="text-lg font-semibold text-white mb-4">File a Claim</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">SLA ID</label>
            <input
              type="number"
              value={form.slaId}
              onChange={e => setForm({ ...form, slaId: e.target.value })}
              className="w-full px-4 py-2 rounded-lg border text-white bg-transparent focus:outline-none"
              style={{ borderColor: 'var(--card-border)' }}
              min="0"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Describe the maintenance issue..."
              rows={3}
              className="w-full px-4 py-2 rounded-lg border text-white bg-transparent focus:outline-none resize-none"
              style={{ borderColor: 'var(--card-border)' }}
              required
            />
          </div>
          <button
            type="submit"
            disabled={txStatus === "pending"}
            className="px-6 py-2 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: 'var(--chainlink-blue)' }}
          >
            {txStatus === "pending" ? "Submitting..." : "File Claim"}
          </button>
          {txStatus === "success" && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-green-400 text-sm">
              Claim filed. CRE will monitor provider response time.
            </motion.p>
          )}
        </form>
      </div>

      {/* Existing claims */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Active Claims</h2>
        <div className="space-y-3">
          {MOCK_CLAIMS.map(claim => (
            <motion.div
              key={claim.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl p-4 border"
              style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white text-sm">{claim.description}</p>
                  <p className="text-gray-400 text-xs mt-1">SLA #{claim.slaId} &middot; Filed {new Date(claim.filedAt).toLocaleDateString()}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs ${claim.resolved ? 'text-green-400 bg-green-400/10' : 'text-yellow-400 bg-yellow-400/10'}`}>
                  {claim.resolved ? 'Resolved' : 'Pending'}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
