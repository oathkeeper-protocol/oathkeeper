"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IDKitRequestWidget, deviceLegacy, type IDKitResult, type RpContext } from "@worldcoin/idkit";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, usePublicClient } from "wagmi";
import { parseEther, parseAbiItem } from "viem";
import { DEPLOY_BLOCK } from "@/lib/contract";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { SLA_CONTRACT_ADDRESS, SLA_ABI } from "@/lib/contract";
import { decodeProof } from "@/lib/proof";
import Link from "next/link";

const APP_ID = (process.env.NEXT_PUBLIC_WLD_APP_ID || "app_staging_oathlayer") as `app_${string}`;
const ACTION = "oathlayer-provider-register";

const TENDERLY_EXPLORER = process.env.NEXT_PUBLIC_TENDERLY_EXPLORER || "";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

type TxStep = "pending" | "confirming" | "success" | "reverted";

function TxProgressPopup({
  step,
  txHash,
  error,
  onClose,
}: {
  step: TxStep;
  txHash?: string;
  error?: string;
  onClose: () => void;
}) {
  const steps: { key: TxStep; label: string }[] = [
    { key: "pending", label: "Approve in wallet" },
    { key: "confirming", label: "Confirming on-chain" },
    { key: "success", label: "Registration complete" },
  ];

  const isReverted = step === "reverted";
  const currentIdx = isReverted ? 1 : steps.findIndex(s => s.key === step);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
      }}
      onClick={step === "success" || isReverted ? onClose : undefined}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="glass-card glass-card-glow rounded-2xl p-6 w-full max-w-sm mx-4"
        style={{ border: "1px solid rgba(55,91,210,0.3)" }}
        onClick={e => e.stopPropagation()}
      >
        <p className="font-semibold text-white text-[16px] mb-5">
          {isReverted ? "Transaction Failed" : "Registering Provider"}
        </p>

        <div className="space-y-3 mb-5">
          {steps.map((s, i) => {
            const isActive = i === currentIdx && !isReverted;
            const isDone = i < currentIdx || step === "success";
            const isFailed = isReverted && i === 1;

            return (
              <div key={s.key} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{
                  background: isFailed ? "rgba(239,68,68,0.15)"
                    : isDone ? "rgba(74,222,128,0.15)"
                    : isActive ? "rgba(55,91,210,0.2)"
                    : "rgba(255,255,255,0.04)",
                  border: isActive ? "2px solid rgba(55,91,210,0.5)" : "1px solid transparent",
                }}>
                  {isFailed ? (
                    <span className="text-[11px] text-red-400">✕</span>
                  ) : isDone ? (
                    <span className="text-[11px]" style={{ color: "rgba(74,222,128,0.8)" }}>✓</span>
                  ) : isActive ? (
                    <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-t-transparent rounded-full" style={{ borderColor: "var(--chainlink-light)", borderTopColor: "transparent" }} />
                  ) : (
                    <span className="text-[11px]" style={{ color: "var(--muted)" }}>{i + 1}</span>
                  )}
                </div>
                <span className="text-[13px]" style={{
                  color: isFailed ? "#ef4444"
                    : isDone ? "rgba(74,222,128,0.8)"
                    : isActive ? "#fff"
                    : "var(--muted)",
                }}>
                  {isFailed ? "Transaction reverted" : s.label}
                </span>
              </div>
            );
          })}
        </div>

        {txHash && (
          <div className="flex items-center justify-between p-3 rounded-lg mb-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--card-border)" }}>
            <span className="font-mono text-[11px] text-white">{txHash.slice(0, 14)}...{txHash.slice(-6)}</span>
            {TENDERLY_EXPLORER && (
              <a
                href={`${TENDERLY_EXPLORER}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-medium px-2 py-1 rounded-md"
                style={{ color: "var(--chainlink-light)", background: "rgba(55,91,210,0.12)" }}
              >
                Explorer ↗
              </a>
            )}
          </div>
        )}

        {isReverted && error && (
          <p className="text-[12px] text-red-400 mb-4">{error}</p>
        )}

        {(step === "success" || isReverted) && (
          <button onClick={onClose} className="btn-primary w-full py-2.5 text-[13px]">
            {step === "success" ? "Done" : "Close"}
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}

function ComplianceStatusBadge({ address }: { address: string }) {
  const { data: complianceStatus } = useReadContract({
    address: SLA_CONTRACT_ADDRESS,
    abi: SLA_ABI,
    functionName: "providerCompliance",
    args: [address as `0x${string}`],
    query: { refetchInterval: 5_000 },
  });

  const status = Number(complianceStatus ?? 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-xl mt-4 p-4"
      style={{
        borderColor: status === 1 ? "rgba(74,222,128,0.15)" : status === 2 ? "rgba(239,68,68,0.15)" : undefined,
      }}
    >
      {status === 0 && (
        <div className="flex items-center gap-2" style={{ color: "var(--muted-strong)" }}>
          <span className="animate-spin inline-block w-4 h-4 border-2 border-t-transparent rounded-full" style={{ borderColor: "var(--chainlink-light)", borderTopColor: "transparent" }} />
          <span className="text-[13px]">Compliance check in progress...</span>
        </div>
      )}
      {status === 1 && (
        <div className="flex items-center gap-2">
          <span className="text-lg" style={{ color: "rgba(74,222,128,0.8)" }}>&#10003;</span>
          <div>
            <p className="font-medium text-white text-[14px]">Compliance approved</p>
            <p className="text-[12px]" style={{ color: "var(--muted)" }}>
              You can now <Link href="/sla/create" className="underline" style={{ color: "var(--chainlink-light)" }}>create SLAs</Link>
            </p>
          </div>
        </div>
      )}
      {status === 2 && (
        <div className="flex items-center gap-2 text-red-400">
          <span className="text-lg">&#10007;</span>
          <div>
            <p className="font-medium text-[14px]">Compliance rejected</p>
            <p className="text-[12px]" style={{ color: "var(--muted)" }}>This address has been permanently blocked</p>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function RegisterProvider() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [idkitOpen, setIdkitOpen] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [proofResult, setProofResult] = useState<IDKitResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [regTxHash, setRegTxHash] = useState<string | null>(null);
  const [regNullifier, setRegNullifier] = useState<string | null>(null);
  const [nullifierReuse, setNullifierReuse] = useState(false);
  const [showTxPopup, setShowTxPopup] = useState(false);
  const bondAmount = "0.1";

  // Check if already registered on-chain
  const { data: isAlreadyVerified, isLoading: isCheckingRegistration } = useReadContract({
    address: SLA_CONTRACT_ADDRESS,
    abi: SLA_ABI,
    functionName: "verifiedProviders",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { writeContract, data: txHash, isPending, error, reset: resetTx } = useWriteContract();
  const { data: receipt, isLoading: isConfirming, isSuccess: isReceiptSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const isReverted = isReceiptSuccess && receipt?.status === "reverted";
  const isSuccess = isReceiptSuccess && receipt?.status === "success";

  // Clear all state if wallet disconnects or address changes
  useEffect(() => {
    if (!isConnected) {
      setProofResult(null);
      setVerifyError(null);
      setRpContext(null);
      setIdkitOpen(false);
    }
  }, [isConnected, address]);

  // Fetch registration tx hash for already-registered providers
  useEffect(() => {
    if (!publicClient || !address || !isAlreadyVerified) return;
    publicClient.getLogs({
      address: SLA_CONTRACT_ADDRESS,
      event: parseAbiItem("event ProviderRegistered(address indexed provider, uint256 nullifierHash)"),
      args: { provider: address },
      fromBlock: DEPLOY_BLOCK,
      toBlock: "latest",
    }).then(logs => {
      if (logs.length > 0) {
        setRegTxHash(logs[0].transactionHash);
        const nullHash = logs[0].args.nullifierHash;
        if (nullHash) setRegNullifier("0x" + nullHash.toString(16));
      }
    }).catch(() => {});
  }, [publicClient, address, isAlreadyVerified]);

  // Fetch RP signature from backend
  const fetchRpContext = useCallback(async () => {
    try {
      const res = await fetch("/api/worldid/sign", { method: "POST" });
      if (!res.ok) throw new Error("Failed to get RP signature");
      const data = await res.json();
      setRpContext(data as RpContext);
    } catch (e) {
      console.error("RP sign error:", e);
      setVerifyError("Failed to initialize World ID. Check server configuration.");
    }
  }, []);

  useEffect(() => {
    if (isConnected && !isAlreadyVerified) {
      fetchRpContext();
    }
  }, [isConnected, isAlreadyVerified, fetchRpContext]);

  const handleVerify = async (result: IDKitResult) => {
    setVerifyError(null);
    setNullifierReuse(false);
    // Forward the IDKit result as-is to the v4 verify API
    const res = await fetch("/api/verify-worldid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data?.error || "World ID verification failed";
      setVerifyError(msg);
      throw new Error(msg);
    }
    const data = await res.json().catch(() => ({}));
    if (data?.message?.includes("nullifier reuse")) {
      setNullifierReuse(true);
    }
    setProofResult(result);
  };

  const handleRegister = () => {
    if (!proofResult) return;
    const resp = proofResult.responses[0];
    if (!resp || !("merkle_root" in resp)) {
      setVerifyError("Invalid proof format — expected legacy proof");
      return;
    }
    setShowTxPopup(true);
    const v3 = resp as { merkle_root: string; nullifier: string; proof: string };
    writeContract({
      address: SLA_CONTRACT_ADDRESS,
      abi: SLA_ABI,
      functionName: "registerProvider",
      args: [BigInt(v3.merkle_root), BigInt(v3.nullifier), decodeProof(v3.proof)],
      value: parseEther(bondAmount),
    });
  };

  const isLoading = isPending || isConfirming;
  const alreadyRegistered = !!isAlreadyVerified;
  const verified = !!proofResult && isConnected;

  const txStep: TxStep = error ? "reverted" : isReverted ? "reverted" : isSuccess ? "success" : isConfirming ? "confirming" : "pending";
  const txErrorMsg = error
    ? (error.message.includes("revert") ? "Transaction reverted — this address may already be registered or the nullifier was used." : error.message.split("\n")[0])
    : isReverted
    ? "Transaction reverted on-chain — World ID root may be stale on this network."
    : undefined;

  // Loading state while checking registration
  if (isConnected && isCheckingRegistration) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight mb-1">Register as Provider</h1>
          <p className="text-[14px]" style={{ color: "var(--muted)" }}>
            Verify your identity with World ID and deposit ETH to register as a compliant provider.
          </p>
        </div>
        <div className="glass-card glass-card-glow rounded-2xl p-6 mb-3">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg animate-pulse" style={{ background: "rgba(55,91,210,0.2)" }} />
            <div className="flex-1">
              <div className="h-4 w-32 rounded animate-pulse mb-1.5" style={{ background: "rgba(255,255,255,0.06)" }} />
              <div className="h-3 w-48 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
            </div>
          </div>
          <div className="h-11 w-full rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
        </div>
        <div className="glass-card glass-card-glow rounded-2xl p-6 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg animate-pulse" style={{ background: "rgba(55,91,210,0.2)" }} />
            <div className="flex-1">
              <div className="h-4 w-36 rounded animate-pulse mb-1.5" style={{ background: "rgba(255,255,255,0.06)" }} />
              <div className="h-3 w-52 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
            </div>
          </div>
          <div className="h-10 w-full rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
        </div>
        <div className="h-12 w-full rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
      </div>
    );
  }

  // Already registered — show status with same layout as registration flow
  if (isConnected && alreadyRegistered) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight mb-1">Register as Provider</h1>
          <p className="text-[14px]" style={{ color: "var(--muted)" }}>
            Verify your identity with World ID and deposit ETH to register as a compliant provider.
          </p>
        </div>

        {/* Step 1: Verified */}
        <div className="glass-card glass-card-glow rounded-2xl p-6 mb-3">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-semibold text-white"
              style={{ background: "rgba(74,222,128,0.15)" }}
            >
              ✓
            </div>
            <div>
              <p className="font-medium text-white text-[14px]">Identity Verified</p>
              <p className="text-[12px]" style={{ color: "var(--muted)" }}>World ID prevents Sybil attacks</p>
            </div>
          </div>
          <div className="flex items-center gap-2" style={{ color: "rgba(74,222,128,0.8)" }}>
            <span>✓</span>
            <span className="text-[13px]">World ID verified</span>
            {regNullifier && (
              <span className="font-mono text-[11px] ml-2" style={{ color: "var(--muted)" }}>{regNullifier.slice(0, 14)}...</span>
            )}
          </div>
        </div>

        {/* Step 2: Deposit confirmed */}
        <div className="glass-card glass-card-glow rounded-2xl p-6 mb-3">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-semibold text-white"
              style={{ background: "rgba(74,222,128,0.15)" }}
            >
              ✓
            </div>
            <div>
              <p className="font-medium text-white text-[14px]">Registration Deposit</p>
              <p className="text-[12px]" style={{ color: "var(--muted)" }}>0.1 ETH deposited</p>
            </div>
          </div>
          <div className="flex items-center gap-2" style={{ color: "rgba(74,222,128,0.8)" }}>
            <span>✓</span>
            <span className="text-[13px]">Provider registered on-chain</span>
          </div>
        </div>

        {/* Registration proof */}
        {regTxHash && (
          <div className="glass-card rounded-xl p-4 mb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium" style={{ color: "var(--muted)" }}>Registration Proof</p>
                <p className="font-mono text-[11px] mt-1 text-white">{regTxHash.slice(0, 22)}...{regTxHash.slice(-6)}</p>
              </div>
              <a
                href={`${process.env.NEXT_PUBLIC_TENDERLY_EXPLORER}/tx/${regTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                style={{ color: "var(--chainlink-light)", background: "rgba(55,91,210,0.12)", border: "1px solid rgba(55,91,210,0.2)" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(55,91,210,0.2)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(55,91,210,0.12)"}
              >
                View on Explorer ↗
              </a>
            </div>
          </div>
        )}

        <ComplianceStatusBadge address={address!} />

        <div className="mt-6">
          <Link href="/sla/create" className="btn-primary block text-center w-full py-3 text-[14px]">
            Create an SLA Agreement
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <motion.div initial="hidden" animate="visible">
        <motion.div custom={0} variants={fadeUp}>
          <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight mb-1">Register as Provider</h1>
          <p className="text-[14px] mb-8" style={{ color: "var(--muted)" }}>
            Verify your identity with World ID and deposit ETH to register as a compliant provider.
          </p>
        </motion.div>

        {!isConnected && (
          <motion.div custom={1} variants={fadeUp} className="glass-card rounded-2xl p-6 mb-4 flex flex-col items-center gap-4">
            <p className="text-[13px]" style={{ color: "var(--muted)" }}>Connect your wallet to register</p>
            <ConnectButton />
          </motion.div>
        )}

        {/* Step 1: World ID */}
        <div
          className="glass-card glass-card-glow rounded-2xl p-6 mb-3 transition-opacity"
          style={{ opacity: !isConnected ? 0.4 : 1, pointerEvents: !isConnected ? "none" : "auto" }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-semibold text-white"
              style={{ background: verified ? "rgba(74,222,128,0.15)" : "rgba(55,91,210,0.2)" }}
            >
              {verified ? "✓" : "1"}
            </div>
            <div>
              <p className="font-medium text-white text-[14px]">Verify Identity</p>
              <p className="text-[12px]" style={{ color: "var(--muted)" }}>World ID prevents Sybil attacks</p>
            </div>
          </div>

          {verified ? (
            <div className="flex items-center gap-2" style={{ color: "rgba(74,222,128,0.8)" }}>
              <span>✓</span>
              <span className="text-[13px]">World ID verified</span>
              <span className="font-mono text-[11px] ml-2" style={{ color: "var(--muted)" }}>
                {proofResult.responses[0] && "nullifier" in proofResult.responses[0]
                  ? (proofResult.responses[0] as { nullifier: string }).nullifier.slice(0, 14)
                  : ""}...
              </span>
            </div>
          ) : (
            <>
              {rpContext && (
                <IDKitRequestWidget
                  open={idkitOpen}
                  onOpenChange={setIdkitOpen}
                  app_id={APP_ID}
                  action={ACTION}
                  rp_context={rpContext}
                  allow_legacy_proofs={true}
                  preset={deviceLegacy({ signal: address ?? "" })}
                  handleVerify={handleVerify}
                  onSuccess={() => {}}
                  onError={(errorCode) => {
                    setVerifyError(`World ID error: ${errorCode}`);
                  }}
                />
              )}
              <button
                onClick={async () => {
                  setVerifyError(null);
                  if (!rpContext) {
                    await fetchRpContext();
                  }
                  setIdkitOpen(true);
                }}
                disabled={!isConnected}
                className="btn-primary w-full py-3 text-[14px]"
              >
                Verify with World ID
              </button>
            </>
          )}

          {verifyError && (
            <div className="mt-3 p-3 rounded-lg text-[13px]" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
              <p className="text-red-400">{verifyError}</p>
            </div>
          )}

          {nullifierReuse && verified && (
            <div className="mt-3 p-3 rounded-lg text-[13px]" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)" }}>
              <p className="font-medium" style={{ color: "#f59e0b" }}>Nullifier already used</p>
              <p className="mt-1" style={{ color: "var(--muted)" }}>
                This World ID has already verified for this action. Each unique person can only register once — this is how Sybil resistance works. Use a different World ID to register a new provider.
              </p>
            </div>
          )}
        </div>

        {/* Step 2: Registration Deposit */}
        <div
          className="glass-card glass-card-glow rounded-2xl p-6 mb-4 transition-opacity"
          style={{ opacity: !verified ? 0.4 : 1 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-semibold text-white"
              style={{ background: "rgba(55,91,210,0.2)" }}
            >
              2
            </div>
            <div>
              <p className="font-medium text-white text-[14px]">Registration Deposit</p>
              <p className="text-[12px]" style={{ color: "var(--muted)" }}>Minimum 0.1 ETH — shows you&apos;re committed to comply</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--card-border)" }}>
            <span className="text-white font-mono text-[14px]">0.1</span>
            <span className="text-[13px]" style={{ color: "var(--muted)" }}>ETH</span>
          </div>
        </div>

        {/* Register */}
        <div>
          <button
            onClick={handleRegister}
            disabled={!verified || !isConnected || isLoading}
            className="btn-primary w-full py-3 text-[14px]"
          >
            Register as Provider
          </button>
        </div>

        {/* Tx Progress Popup */}
        <AnimatePresence>
          {showTxPopup && (
            <TxProgressPopup
              step={txStep}
              txHash={txHash}
              error={txErrorMsg}
              onClose={() => { setShowTxPopup(false); resetTx(); }}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
