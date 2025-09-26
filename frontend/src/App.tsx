import { useState } from "react";
import { StockChart } from "./components/StockChart";
import { AdvancedStatsPanel } from "./components/AdvancedStats";
import { RealtimeStatsPanel } from "./components/RealTimeStats";
import "./App.css";

interface TickData {
  time: number;
  close: number;
}

export default function App() {
  const [prevClose, setPrevClose] = useState<number | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [ticks, setTicks] = useState<TickData[]>([]);

  // Called whenever StockChart triggers a refresh
  const handleRefreshTrigger = () => {
    setRefreshCounter(c => c + 1);
  };

  // Add a new tick to the ticks state
  const handleNewTick = (tick: TickData) => {
    setTicks(prev => [...prev, tick]);
  };

  return (
    <div className="app-container">
      <h2 className="app-title">📉 Real-Time Stock Prediction 📈</h2>

      <StockChart
        prevClose={prevClose}
        onRefreshTrigger={handleRefreshTrigger}
        onNewTick={handleNewTick} // <-- Pass it to StockChart
      />

      <div className="stats-container">
        <div className="realtime-stats">
          <RealtimeStatsPanel ticks={ticks} />
        </div>
        <div className="advanced-stats">
          <AdvancedStatsPanel
            symbol="NVDA"
            onPrevClose={setPrevClose}
            refreshTrigger={refreshCounter}
          />
        </div>
      </div>
    </div>
  );
}
