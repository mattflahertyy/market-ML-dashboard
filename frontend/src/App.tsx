import { useEffect, useRef } from "react";
import { createChart, LineSeries, ColorType } from "lightweight-charts";
import type { IChartApi, ISeriesApi, Time, LineData } from "lightweight-charts";
import "./App.css";

export default function App() {
  const chartContainer = useRef<HTMLDivElement | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const buffer = useRef<LineData[]>([]);
  const hasSetInitialRange = useRef(false);

  useEffect(() => {
    if (!chartContainer.current) return;

    const chart: IChartApi = createChart(chartContainer.current, {
      width: chartContainer.current.clientWidth,
      height: chartContainer.current.clientHeight,
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

      const localTime = tick.time - (new Date().getTimezoneOffset() * 60);

      const point: LineData = { time: localTime as Time, value: tick.close };
      buffer.current.push(point);
      lineSeries.update(point);

      if (!hasSetInitialRange.current && buffer.current.length === 1) {
        const firstPrice = point.value;
        const rangePercent = 0.02;
        chart.priceScale("right").applyOptions({ autoScale: false });
        chart.priceScale("right").setVisibleRange({
          from: firstPrice * (1 - rangePercent),
          to: firstPrice * (1 + rangePercent),
        });
        hasSetInitialRange.current = true;
      } else if (hasSetInitialRange.current) {
        const currentRange = chart.priceScale("right").getVisibleRange();
        if (currentRange) {
          const currentPrice = point.value;
          const rangeSize = currentRange.to - currentRange.from;
          const bufferPercent = 0.15;
          const nearTop = currentPrice > currentRange.to - rangeSize * bufferPercent;
          const nearBottom = currentPrice < currentRange.from + rangeSize * bufferPercent;
          if (nearTop || nearBottom) {
            const newRangeSize = rangeSize * 1.5;
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
    <div className="app-container">
      <h2 className="app-title">📈 Market ML Dashboard</h2>

      <div ref={chartContainer} className="chart-container" />

      <div className="future-work">Future work (financial metrics)</div>
    </div>
  );
}
