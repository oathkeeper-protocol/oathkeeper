"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { IDKitWidget, VerificationLevel } from "@worldcoin/idkit";

const MOCK_DISPUTES = [
  {
    slaId: 0,
    provider: "0x742d35Cc...",
    uptimeBps: 9820,
    penaltyAmount: "0.075",
    timestamp: "2026-02-26T09:15:00Z",
    status: "pending",
  },
];

export default function Arbitrate() {
  const [verified, setVerified] = useState(false);

  const handleVerify = async (proof: { [key: string]: unknown }) => {
    const res = await fetch("/api/verify-worldid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...proof, action: "oathkeeper-arbitrator-register" }),
    });
    if (!res.ok) throw new Error("Verification failed");
    setVerified(true);
  };

  if (!verified) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
             style={{ background: 'var(--card)', border: '1px solid var(--card-border)' }}>
          <span className="text-2xl">&#x1F512;</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Arbitration Panel</h1>
        <p className="text-gray-400 mb-8">World ID verification required to access arbitration. This prevents Sybil attacks on dispute resolution.</p>

        <IDKitWidget
          app_id={(process.env.NEXT_PUBLIC_WLD_APP_ID || "app_staging_test") as `app_${string}`}
          action="oathkeeper-arbitrator-register"
          verification_level={VerificationLevel.Device}
          handleVerify={handleVerify}
          onSuccess={() => {}}
        >
          {({ open }: { open: () => void }) => (
            <button
              onClick={open}
              className="px-8 py-3 rounded-lg font-medium text-white"
              style={{ background: 'var(--chainlink-blue)' }}
            >
              Verify with World ID to Access
            </button>
          )}
        </IDKitWidget>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold text-white">Arbitration Panel</h1>
          <span className="px-2 py-0.5 rounded-full text-xs text-green-400 bg-green-400/10">World ID Verified</span>
        </div>
        <p className="text-gray-400">Review and resolve disputed SLA breaches.</p>
      </div>

      {MOCK_DISPUTES.map((dispute, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl p-6 border"
          style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="font-medium text-white">SLA #{dispute.slaId} Breach Dispute</p>
              <p className="text-sm text-gray-400 mt-1">Provider {dispute.provider} &middot; Uptime {dispute.uptimeBps / 100}%</p>
              <p className="text-sm text-gray-400">Penalty: {dispute.penaltyAmount} ETH &middot; {new Date(dispute.timestamp).toLocaleString()}</p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs text-yellow-400 bg-yellow-400/10">Pending Review</span>
          </div>

          <div className="p-4 rounded-lg mb-4 text-sm" style={{ background: '#0d0d1a' }}>
            <p className="text-gray-400">CRE detected uptime below threshold. Provider claims API measurement was incorrect during a monitoring window.</p>
          </div>

          <div className="flex gap-3">
            <button
              className="flex-1 py-2 rounded-lg text-sm font-medium border border-green-400/20 text-green-400 hover:bg-green-400/10 transition-colors"
              onClick={() => alert("Breach upheld — penalty confirmed")}
            >
              Uphold Breach
            </button>
            <button
              className="flex-1 py-2 rounded-lg text-sm font-medium border border-red-400/20 text-red-400 hover:bg-red-400/10 transition-colors"
              onClick={() => alert("Breach overturned — penalty reversed")}
            >
              Overturn Decision
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
