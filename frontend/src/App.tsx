import { useEffect, useRef } from "react";
import { createChart, LineSeries, ColorType } from "lightweight-charts";
import type { IChartApi, ISeriesApi, Time, LineData } from "lightweight-charts";

export default function App() {
  const chartContainer = useRef<HTMLDivElement | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const buffer = useRef<LineData[]>([]);
  const hasSetInitialRange = useRef(false);

  useEffect(() => {
    if (!chartContainer.current) return;

    const chart: IChartApi = createChart(chartContainer.current, {
      width: 900,
      height: 450,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#333",
      },
      grid: {
        vertLines: { color: "#e0e0e0" },
        horzLines: { color: "#e0e0e0" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
      },
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: "#2196F3",
      lineWidth: 2,
    });
    seriesRef.current = lineSeries;

    const ws = new WebSocket("ws://localhost:8000/ws/ticks");
    ws.onopen = () => console.log("✅ WebSocket connected");

    ws.onmessage = (event) => {
      const tick = JSON.parse(event.data) as { time: number; close: number };
      const point: LineData = { time: tick.time as Time, value: tick.close };
      buffer.current.push(point);

      // Always update the chart with new data
      lineSeries.update(point);

      if (!hasSetInitialRange.current && buffer.current.length === 1) {
        // Set a realistic initial range based on first tick (like a real trading platform)
        const firstPrice = point.value;
        const rangePercent = 0.02; // 2% range seems reasonable for stocks
        
        chart.priceScale("right").applyOptions({
          autoScale: false,
        });
        chart.priceScale("right").setVisibleRange({
          from: firstPrice * (1 - rangePercent),
          to: firstPrice * (1 + rangePercent),
        });
        hasSetInitialRange.current = true;
      } else if (hasSetInitialRange.current) {
        // Check if current price is approaching boundaries
        const currentRange = chart.priceScale("right").getVisibleRange();
        
        if (currentRange) { // TypeScript null check
          const currentPrice = point.value;
          const rangeSize = currentRange.to - currentRange.from;
          const bufferPercent = 0.15; // 15% buffer from edge
          
          const nearTop = currentPrice > (currentRange.to - rangeSize * bufferPercent);
          const nearBottom = currentPrice < (currentRange.from + rangeSize * bufferPercent);
          
          if (nearTop || nearBottom) {
            // Expand the range while keeping current price centered
            const newRangeSize = rangeSize * 1.5; // Expand by 50%
            chart.priceScale("right").setVisibleRange({
              from: currentPrice - newRangeSize / 2,
              to: currentPrice + newRangeSize / 2,
            });
          }
        }
      }
    };

    ws.onerror = (err) => console.error("WebSocket error:", err);
    ws.onclose = () => console.log("WebSocket closed");

    return () => {
      ws.close();
      chart.remove();
    };
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h2>📈 Market ML Dashboard</h2>
      <div
        ref={chartContainer}
        style={{
          border: "1px solid #ccc",
          borderRadius: "4px",
        }}
      />
    </div>
  );
}