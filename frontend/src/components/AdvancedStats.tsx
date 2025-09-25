import { useEffect, useState } from "react";

interface AdvancedStats {
  [key: string]: string | number | null;
}

export function AdvancedStatsPanel({
  symbol,
  onPrevClose,
  refreshTrigger,
}: {
  symbol: string;
  onPrevClose: (val: number) => void;
  refreshTrigger: number;
}) {
  const [stats, setStats] = useState<AdvancedStats | null>(null);

  useEffect(() => {
    fetch(`http://localhost:8000/advanced-stats/${symbol}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.stats) {
          setStats(data.stats);
          const prev = Number(data.stats.previousClose ?? 0);
          onPrevClose(prev);
        } else console.error("No stats field:", data);
      })
      .catch(console.error);
  }, [symbol, onPrevClose, refreshTrigger]);

  if (!stats) return <div>Loading advanced stats...</div>;

  return (
    <div className="advanced-stats">
      <div className="advanced-stats-grid">
        <div className="advanced-stats-item">
          <span className="advanced-stats-label">Previous Close</span>
          <span className="advanced-stats-value">{stats.previousClose}</span>
        </div>
        <div className="advanced-stats-item">
          <span className="advanced-stats-label">Open</span>
          <span className="advanced-stats-value">{stats.open}</span>
        </div>
        <div className="advanced-stats-item">
          <span className="advanced-stats-label">Bid</span>
          <span className="advanced-stats-value">{stats.bid}</span>
        </div>
        <div className="advanced-stats-item">
          <span className="advanced-stats-label">Ask</span>
          <span className="advanced-stats-value">{stats.ask}</span>
        </div>
        <div className="advanced-stats-item">
          <span className="advanced-stats-label">Day’s Range</span>
          <span className="advanced-stats-value">
            {stats.dayLow} – {stats.dayHigh}
          </span>
        </div>
        <div className="advanced-stats-item">
          <span className="advanced-stats-label">52W Range</span>
          <span className="advanced-stats-value">
            {stats.fiftyTwoWeekLow} – {stats.fiftyTwoWeekHigh}
          </span>
        </div>
        <div className="advanced-stats-item">
          <span className="advanced-stats-label">Volume</span>
          <span className="advanced-stats-value">
            {(stats.volume ?? 0).toLocaleString()}
          </span>
        </div>
        <div className="advanced-stats-item">
          <span className="advanced-stats-label">Avg. Volume</span>
          <span className="advanced-stats-value">
            {(stats.averageVolume ?? 0).toLocaleString()}
          </span>
        </div>
        <div className="advanced-stats-item">
          <span className="advanced-stats-label">Market Cap</span>
          <span className="advanced-stats-value">
            {(stats.marketCap ?? 0).toLocaleString()}
          </span>
        </div>
        <div className="advanced-stats-item">
          <span className="advanced-stats-label">Beta</span>
          <span className="advanced-stats-value">
            {Number(stats.beta ?? 0).toFixed(2)}
          </span>
        </div>
        <div className="advanced-stats-item">
          <span className="advanced-stats-label">P/E</span>
          <span className="advanced-stats-value">
            {Number(stats.trailingPE ?? 0).toFixed(2)}
          </span>
        </div>
        <div className="advanced-stats-item">
          <span className="advanced-stats-label">EPS</span>
          <span className="advanced-stats-value">
            {Number(stats.trailingEps ?? 0).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
