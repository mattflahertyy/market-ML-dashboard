import { useState } from "react";
import { StockChart } from "./components/StockChart";
import { AdvancedStatsPanel } from "./components/AdvancedStats";
import "./App.css";

export default function App() {
  const [prevClose, setPrevClose] = useState<number | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const handleRefreshTrigger = () => {
    setRefreshCounter((c) => c + 1);
  };

  return (
    <div className="app-container">
      <h2 className="app-title">📉 Real-Time Stock Prediction 📈</h2>
      <StockChart 
        prevClose={prevClose} 
        onRefreshTrigger={handleRefreshTrigger} 
      />
      <AdvancedStatsPanel 
        symbol="NVDA" 
        onPrevClose={setPrevClose} 
        refreshTrigger={refreshCounter} 
      />
    </div>
  );
}