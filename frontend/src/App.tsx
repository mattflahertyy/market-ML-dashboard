import { useEffect, useRef, useState } from "react";
import { createChart, LineSeries, ColorType } from "lightweight-charts";
import type { IChartApi, ISeriesApi, Time, LineData } from "lightweight-charts";
import "./App.css";

interface Fundamentals {
  [key: string]: string | number | null;
}

function FundamentalsPanel({ symbol }: { symbol: string }) {
  const [stats, setStats] = useState<Fundamentals | null>(null);

  useEffect(() => {
    fetch(`http://localhost:8000/fundamentals/${symbol}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.stats) setStats(data.stats);
        else console.error("No stats field:", data);
      })
      .catch(console.error);
  }, [symbol]);

  if (!stats) return <div>Loading fundamentals…</div>;

  return (
    <div className="fundamentals">
      <h3>{symbol} Key Stats</h3>
      <ul>
        <li>Previous Close: {stats.previousClose}</li>
        <li>Open: {stats.open}</li>
        <li>Bid: {stats.bid}</li>
        <li>Ask: {stats.ask}</li>
        <li>Day’s Range: {stats.dayLow} – {stats.dayHigh}</li>
        <li>52W Range: {stats.fiftyTwoWeekLow} – {stats.fiftyTwoWeekHigh}</li>
        <li>Volume: {stats.volume}</li>
        <li>Avg. Volume: {stats.averageVolume}</li>
        <li>Market Cap: {stats.marketCap}</li>
        <li>Beta: {stats.beta}</li>
        <li>P/E: {stats.trailingPE}</li>
        <li>EPS: {stats.trailingEps}</li>
        <li>Div & Yield: {stats.dividendRate} ({Number(stats.dividendYield ?? 0) * 100}%)</li>
        <li>1y Target Est: {stats.targetMeanPrice}</li>
      </ul>
    </div>
  );
}

export default function App() {
  const chartContainer = useRef<HTMLDivElement | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const buffer = useRef<LineData[]>([]);
  const hasSetInitialRange = useRef(false);

  useEffect(() => {
    if (!chartContainer.current) return;

    const formatTime = (time: number) => {
      const date = new Date(time * 1000);
      const h = date.getHours();
      const m = date.getMinutes();
      if (h === 9 && m === 30) return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear() % 100}`;
      const ampm = h >= 12 ? "PM" : "AM";
      const displayH = h % 12 === 0 ? 12 : h % 12;
      const minStr = m < 10 ? `0${m}` : m;
      return `${displayH}:${minStr} ${ampm}`;
    };

    const chart: IChartApi = createChart(chartContainer.current, {
      width: chartContainer.current.clientWidth,
      height: chartContainer.current.clientHeight,
      layout: { background: { type: ColorType.Solid, color: "#000" }, textColor: "#fff" },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      timeScale: { timeVisible: true, secondsVisible: true, tickMarkFormatter: formatTime },
    });

    const lineSeries = chart.addSeries(LineSeries, { color: "#D60A22", lineWidth: 2 });
    seriesRef.current = lineSeries;

    const ws = new WebSocket("ws://localhost:8000/ws/ticks");
    ws.onmessage = (e) => {
      const tick = JSON.parse(e.data) as { time: number; close: number };
      const point: LineData = { time: tick.time as Time, value: tick.close };
      buffer.current.push(point);
      lineSeries.update(point);

      if (!hasSetInitialRange.current) {
        const firstPrice = point.value;
        chart.priceScale("right").applyOptions({ autoScale: false });
        chart.priceScale("right").setVisibleRange({ from: firstPrice * 0.98, to: firstPrice * 1.02 });
        hasSetInitialRange.current = true;
      }
    };

    const handleResize = () => {
      if (chartContainer.current) {
        chart.applyOptions({
          width: chartContainer.current.clientWidth,
          height: chartContainer.current.clientHeight,
        });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      ws.close();
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  return (
    <div className="app-container">
      <h2 className="app-title">📉 Market ML Dashboard - Real-Time Sock Prediction 📈</h2>
      <div ref={chartContainer} className="chart-container" />
      <FundamentalsPanel symbol="NVDA" />
    </div>
  );
}
