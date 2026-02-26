"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { IDKitWidget, VerificationLevel, type ISuccessResult } from "@worldcoin/idkit";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { SLA_CONTRACT_ADDRESS, SLA_ABI, MOCK_BREACHES } from "@/lib/contract";
import { decodeProof } from "@/lib/proof";

function DisputeCard({
  slaId,
  provider,
  uptimeBps,
  penaltyAmount,
  timestamp,
}: {
  slaId: number;
  provider: string;
  uptimeBps: number;
  penaltyAmount: string;
  timestamp: string;
}) {
  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const [decided, setDecided] = useState<boolean | null>(null);

  const handleArbitrate = (upheld: boolean) => {
    setDecided(upheld);
    writeContract({
      address: SLA_CONTRACT_ADDRESS,
      abi: SLA_ABI,
      functionName: "arbitrate",
      args: [BigInt(slaId), upheld],
    });
  };

  const isLoading = isPending || isConfirming;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl p-6 border"
      style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="font-medium text-white">SLA #{slaId} Breach Dispute</p>
          <p className="text-sm text-gray-400 mt-1">Provider {provider} &middot; Uptime {uptimeBps / 100}%</p>
          <p className="text-sm text-gray-400">Penalty: {penaltyAmount} ETH &middot; {new Date(timestamp).toLocaleString()}</p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs ${isSuccess ? 'text-green-400 bg-green-400/10' : 'text-yellow-400 bg-yellow-400/10'}`}>
          {isSuccess ? (decided ? 'Breach Upheld' : 'Overturned') : 'Pending Review'}
        </span>
      </div>

      <div className="p-4 rounded-lg mb-4 text-sm" style={{ background: '#0d0d1a' }}>
        <p className="text-gray-400">CRE detected uptime below threshold. Provider claims API measurement was incorrect during a monitoring window.</p>
      </div>

      {isSuccess ? (
        <p className="text-sm text-green-400">
          Decision recorded on-chain.{" "}
          <a href={`${process.env.NEXT_PUBLIC_TENDERLY_EXPLORER}/tx/${txHash}`} target="_blank" rel="noreferrer" className="underline font-mono text-xs">
            View tx
          </a>
        </p>
      ) : (
        <div className="flex gap-3">
          <button
            disabled={isLoading}
            onClick={() => handleArbitrate(true)}
            className="flex-1 py-2 rounded-lg text-sm font-medium border border-green-400/20 text-green-400 hover:bg-green-400/10 transition-colors disabled:opacity-50"
          >
            {isLoading && decided === true ? "Submitting..." : "Uphold Breach"}
          </button>
          <button
            disabled={isLoading}
            onClick={() => handleArbitrate(false)}
            className="flex-1 py-2 rounded-lg text-sm font-medium border border-red-400/20 text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
          >
            {isLoading && decided === false ? "Submitting..." : "Overturn Decision"}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-red-400 text-sm">{error.message.split("\n")[0]}</p>
      )}
    </motion.div>
  );
}

export default function Arbitrate() {
  const { address, isConnected } = useAccount();
  const [proof, setProof] = useState<ISuccessResult | null>(null);

  const { data: isVerifiedArbitrator } = useReadContract({
    address: SLA_CONTRACT_ADDRESS,
    abi: SLA_ABI,
    functionName: "verifiedArbitrators",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { writeContract, data: regTxHash, isPending: regPending, error: regError } = useWriteContract();
  const { isLoading: regConfirming, isSuccess: regSuccess } = useWaitForTransactionReceipt({ hash: regTxHash });

  const handleVerify = async (result: ISuccessResult) => {
    const res = await fetch("/api/verify-worldid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...result, action: "oathlayer-arbitrator-register" }),
    });
    if (!res.ok) throw new Error("Verification failed");
    setProof(result);
  };

  const handleRegisterArbitrator = () => {
    if (!proof) return;
    writeContract({
      address: SLA_CONTRACT_ADDRESS,
      abi: SLA_ABI,
      functionName: "registerArbitrator",
      args: [
        BigInt(proof.merkle_root),
        BigInt(proof.nullifier_hash),
        decodeProof(proof.proof),
      ],
    });
  };

  const isRegistered = isVerifiedArbitrator || regSuccess;

  if (!isConnected) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
             style={{ background: 'var(--card)', border: '1px solid var(--card-border)' }}>
          <span className="text-2xl">&#x1F512;</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Arbitration Panel</h1>
        <p className="text-gray-400 mb-8">Connect wallet and verify World ID to access arbitration.</p>
        <ConnectButton />
      </div>
    );
  }

  if (!isRegistered) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
             style={{ background: 'var(--card)', border: '1px solid var(--card-border)' }}>
          <span className="text-2xl">&#x1F512;</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Arbitration Panel</h1>
        <p className="text-gray-400 mb-8">World ID verification required. This prevents Sybil attacks on dispute resolution.</p>

        {!proof ? (
          <IDKitWidget
            app_id={(process.env.NEXT_PUBLIC_WLD_APP_ID || "app_staging_oathlayer") as `app_${string}`}
            action="oathlayer-arbitrator-register"
            signal={address}
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
                Verify with World ID
              </button>
            )}
          </IDKitWidget>
        ) : (
          <div className="space-y-4">
            <p className="text-green-400 text-sm">✓ World ID verified — register on-chain to access panel</p>
            <button
              onClick={handleRegisterArbitrator}
              disabled={regPending || regConfirming}
              className="px-8 py-3 rounded-lg font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--chainlink-blue)' }}
            >
              {regPending || regConfirming ? "Registering..." : "Register as Arbitrator"}
            </button>
            {regError && <p className="text-red-400 text-sm">{regError.message.split("\n")[0]}</p>}
          </div>
        )}
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

      {MOCK_BREACHES.map((dispute, i) => (
        <DisputeCard key={i} {...dispute} />
      ))}
    </div>
  );
}

