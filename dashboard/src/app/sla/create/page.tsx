"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { parseEther, type Address } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { SLA_CONTRACT_ADDRESS, SLA_ABI } from "@/lib/contract";

export default function CreateSLA() {
  const { address, isConnected } = useAccount();
  const [form, setForm] = useState({
    tenantAddress: "" as Address | "",
    responseTimeHrs: 48,
    minUptime: 99.5,
    penaltyPct: 5,
    bondEth: 1.0,
  });

  // Check if connected wallet is a verified provider
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
        BigInt(form.responseTimeHrs),
        BigInt(Math.round(form.minUptime * 100)), // bps
        BigInt(Math.round(form.penaltyPct * 100)), // bps
      ],
      value: parseEther(form.bondEth.toString()),
    });
  };

  const isLoading = isPending || isConfirming;
  const minUptimeBps = Math.round(form.minUptime * 100);
  const penaltyBps = Math.round(form.penaltyPct * 100);

  return (
    <div className="max-w-xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-white mb-2">Create SLA Agreement</h1>
        <p className="text-gray-400 mb-8">Define terms and bond collateral. CRE will automatically enforce violations.</p>

        {!isConnected && (
          <div className="rounded-xl p-6 border mb-6 flex flex-col items-center gap-4"
               style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
            <p className="text-gray-400 text-sm">Connect your wallet to create an SLA</p>
            <ConnectButton />
          </div>
        )}

        {isConnected && isVerified === false && (
          <div className="rounded-xl p-4 border mb-6 border-yellow-400/20 bg-yellow-400/5">
            <p className="text-yellow-400 text-sm">
              You must be a registered provider to create SLAs.{" "}
              <a href="/provider/register" className="underline">Register here</a>.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className={`rounded-xl p-6 border space-y-4 transition-opacity ${!isConnected || !isVerified ? 'opacity-50 pointer-events-none' : ''}`}
               style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Tenant Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={form.tenantAddress}
                onChange={e => setForm({ ...form, tenantAddress: e.target.value as Address })}
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
            disabled={!isConnected || !isVerified || isLoading}
            className="w-full py-3 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: 'var(--chainlink-blue)' }}
          >
            {isLoading ? "Creating SLA..." : isSuccess ? "✓ SLA Created!" : "Create SLA & Bond Collateral"}
          </button>

          {txHash && !isSuccess && (
            <p className="text-xs text-gray-400 text-center font-mono">
              Tx: {txHash.slice(0, 20)}... confirming...
            </p>
          )}

          {isSuccess && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-lg text-green-400 border border-green-400/20 bg-green-400/5"
            >
              <p className="font-medium">SLA created on-chain!</p>
              <p className="text-xs mt-1">Chainlink CRE will now monitor compliance automatically.</p>
              <p className="text-xs mt-1 font-mono text-gray-400">
                Tx:{" "}
                <a
                  href={`${process.env.NEXT_PUBLIC_TENDERLY_EXPLORER}/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {txHash?.slice(0, 20)}...
                </a>
              </p>
            </motion.div>
          )}

          {error && (
            <p className="text-red-400 text-sm">{error.message.split("\n")[0]}</p>
          )}
        </form>
      </motion.div>
    </div>
  );
}
