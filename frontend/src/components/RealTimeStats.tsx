import { useEffect, useState, useCallback } from "react";

interface TickData {
  time: number;
  close: number;
}

interface RealtimeStatsPanelProps {
  ticks: TickData[];
}

export function RealtimeStatsPanel({ ticks }: RealtimeStatsPanelProps) {
  const [rsi, setRsi] = useState<number | null>(null);
  const [macd, setMacd] = useState<number | null>(null);

  function calculateRSI(closes: number[], period = 14): number | null {
    if (closes.length < period + 1) return null;
    let gains = 0,
      losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  function calculateEMA(values: number[], period: number): number | null {
    if (values.length < period) return null;
    const k = 2 / (period + 1);
    let ema = values[0];
    for (let i = 1; i < values.length; i++) {
      ema = values[i] * k + ema * (1 - k);
    }
    return ema;
  }

  const calculateMACD = useCallback((closes: number[]): number | null => {
    const fast = calculateEMA(closes, 12);
    const slow = calculateEMA(closes, 26);
    if (fast === null || slow === null) return null;
    return fast - slow;
  }, []);

  useEffect(() => {
    if (ticks.length === 0) return;
    const closes = ticks.map((t) => t.close);
    setRsi(calculateRSI(closes));
    setMacd(calculateMACD(closes));
  }, [calculateMACD, ticks]);

  function getRsiColor(value: number | null): string {
    if (value === null) return "#fff";
    if (value < 30) return "#00AA76"; 
    if (value > 70) return "#D60A22"; 
    return "#fff";
  }

  function getMacdColor(value: number | null): string {
    if (value === null) return "#fff";
    return value >= 0 ? "#00AA76" : "#D60A22";
  }

  return (
    <div className="stats-panel">
      <h3>Trend & Momentum</h3>
      <div className="stats-item">
        <span className="stats-label">RSI</span>
        <span
          className="stats-value"
          style={{ color: getRsiColor(rsi) }}
        >
          {rsi !== null ? rsi.toFixed(2) : "N/A"}
        </span>
      </div>
      <div className="stats-item">
        <span className="stats-label">MACD</span>
        <span
          className="stats-value"
          style={{ color: getMacdColor(macd) }}
        >
          {macd !== null ? macd.toFixed(2) : "N/A"}
        </span>
      </div>
    </div>
  );
}
