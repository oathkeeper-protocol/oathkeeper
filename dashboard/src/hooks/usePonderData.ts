import { useEffect, useState, useCallback } from "react";
import {
  fetchDashboardData,
  fetchSLADetail,
  type PonderSLA,
  type PonderBreach,
  type PonderWarning,
  type PonderClaim,
} from "@/lib/ponder";

// Poll interval for refetching (matches existing useWatchContractEvent 5s)
const POLL_INTERVAL = 5_000;

export function useDashboardData() {
  const [slas, setSlas] = useState<PonderSLA[]>([]);
  const [breaches, setBreaches] = useState<PonderBreach[]>([]);
  const [warnings, setWarnings] = useState<PonderWarning[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchDashboardData();
      setSlas(data.slas.items);
      setBreaches(data.breachs.items);
      setWarnings(data.breachWarnings.items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [load]);

  // Derived values matching what the dashboard currently computes
  const activeSLAs = slas.filter((s) => s.active).length;
  const totalBonded = slas.reduce(
    (sum, s) => sum + Number(s.bondAmount) / 1e18,
    0
  );
  const breachCount = breaches.length;

  // penalized SLA IDs (from actual breach events)
  const penalizedSlaIds = new Set(breaches.map((b) => Number(b.slaId)));

  // Latest risk score per SLA
  const latestRiskScores = new Map<number, number>();
  for (const s of slas) {
    if (s.latestRiskScore !== null) {
      latestRiskScores.set(Number(s.slaId), s.latestRiskScore);
    }
  }

  return {
    slas,
    breaches,
    warnings,
    isLoading,
    error,
    activeSLAs,
    totalBonded,
    breachCount,
    penalizedSlaIds,
    latestRiskScores,
  };
}

export function useSLADetail(slaId: string) {
  const [sla, setSla] = useState<PonderSLA | null>(null);
  const [breaches, setBreaches] = useState<PonderBreach[]>([]);
  const [warnings, setWarnings] = useState<PonderWarning[]>([]);
  const [claims, setClaims] = useState<PonderClaim[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchSLADetail(slaId);
      setSla(data.sla);
      setBreaches(data.breachs.items);
      setWarnings(data.breachWarnings.items);
      setClaims(data.claims.items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [slaId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [load]);

  return { sla, breaches, warnings, claims, isLoading, error };
}
