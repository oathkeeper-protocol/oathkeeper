"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';

interface DataPoint {
  time: string;
  uptime: number;
}

interface Props {
  data: DataPoint[];
  threshold: number; // in bps (e.g. 9950 = 99.50%)
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: { uptime: number };
}

function CustomDot({ cx, cy, payload }: DotProps) {
  if (cx === undefined || cy === undefined || !payload) return null;
  const thresholdPct = 99; // fallback; actual threshold passed via closure below
  const isBreached = payload.uptime < thresholdPct;
  return <circle cx={cx} cy={cy} r={3} fill={isBreached ? '#ef4444' : '#5493F7'} />;
}

function makeDot(thresholdPct: number) {
  return function Dot({ cx, cy, payload }: DotProps) {
    if (cx === undefined || cy === undefined || !payload) return null;
    const isBreached = payload.uptime < thresholdPct;
    return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={3} fill={isBreached ? '#ef4444' : '#5493F7'} />;
  };
}

// Suppress unused warning
void CustomDot;

export function ComplianceChart({ data, threshold }: Props) {
  const thresholdPct = threshold / 100;
  const Dot = makeDot(thresholdPct);

  return (
    <div className="mt-4">
      <p className="text-xs text-gray-400 mb-2">Uptime History (24h)</p>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
          <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 10 }} />
          <YAxis domain={[97, 100]} stroke="#6b7280" tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: '8px', color: '#e2e8f0' }}
            formatter={(value: number | undefined) => [`${value ?? ''}%`, 'Uptime']}
          />
          <ReferenceLine
            y={thresholdPct}
            stroke="#ef4444"
            strokeDasharray="4 4"
            label={{ value: `Min ${thresholdPct}%`, fill: '#ef4444', fontSize: 10 }}
          />
          <Line
            type="monotone"
            dataKey="uptime"
            stroke="#5493F7"
            strokeWidth={2}
            dot={<Dot />}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
