import { useEffect, useRef } from "react";
import { createChart, LineSeries, ColorType } from "lightweight-charts";
import type { IChartApi, ISeriesApi, Time, LineData } from "lightweight-charts";
import "./App.css";

export default function App() {
  const chartContainer = useRef<HTMLDivElement | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const buffer = useRef<LineData[]>([]);
  const hasSetInitialRange = useRef(false);
  const markerSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!chartContainer.current) return;

    const formatTime = (time: number) => {
      const date = new Date(time * 1000);
      const hours = date.getHours();
      const minutes = date.getMinutes();
      // Only show date at 9:30 AM
      if (hours === 9 && minutes === 30) {
        return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear() % 100}`;
      }
      // Otherwise just show time
      const ampm = hours >= 12 ? "PM" : "AM";
      const displayHours = hours % 12 === 0 ? 12 : hours % 12;
      const minStr = minutes < 10 ? `0${minutes}` : minutes;
      return `${displayHours}:${minStr} ${ampm}`;
    };

    const chart: IChartApi = createChart(chartContainer.current, {
      width: chartContainer.current.clientWidth,
      height: chartContainer.current.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#000000ff" },
        textColor: "#ffffffff",
        fontSize: 11,
        fontFamily: "Arial",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        tickMarkFormatter: formatTime,
      },
    });

    chart.applyOptions({ localization: { timeFormatter: formatTime } });

    // Main line series
    const lineSeries = chart.addSeries(LineSeries, {
      color: "#D60A22",
      lineWidth: 2,
    });
    seriesRef.current = lineSeries;


    // Marker line series for 9:30 AM
    const markerSeries = chart.addSeries(LineSeries, {
      color: "rgba(255, 255, 255, 0.3)",
      lineWidth: 1,
    });
    markerSeriesRef.current = markerSeries;

    // Draw vertical line at 9:30 AM
    const today = new Date();
    const toUnix = (h: number, m: number) =>
      Math.floor(
        new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m).getTime() / 1000
      );
    const openTime = toUnix(9, 30);
    markerSeries.setData([
      { time: openTime as Time, value: 0 },
      { time: openTime + 1 as Time, value: 1000 },
    ]);

    const ws = new WebSocket("ws://localhost:8000/ws/ticks");
    ws.onopen = () => console.log("✅ WebSocket connected");

    ws.onmessage = (event) => {
      const tick = JSON.parse(event.data) as { time: number; close: number, date: string };
      const point: LineData = { time: tick.time as Time, value: tick.close };
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

        // Initial zoom: full trading day + 1.5× extra zoom out
        chart.timeScale().setVisibleLogicalRange({ from: -550, to: 100 });
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
