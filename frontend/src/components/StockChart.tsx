import { useEffect, useRef } from "react";
import { createChart, LineSeries, ColorType } from "lightweight-charts";
import type { IChartApi, ISeriesApi, Time, LineData } from "lightweight-charts";

interface TickData extends LineData {
  open: number;
  high: number;
  low: number;
  volume: number;
}

interface StockChartProps {
  prevClose: number | null;
  onRefreshTrigger: () => void;
}

export function StockChart({ prevClose, onRefreshTrigger }: StockChartProps) {
  const chartContainer = useRef<HTMLDivElement | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const buffer = useRef<TickData[]>([]);
  const hasSetInitialRange = useRef(false);
  
  // Store the latest values in refs so they can be accessed without causing re-renders
  const prevCloseRef = useRef(prevClose);
  const onRefreshTriggerRef = useRef(onRefreshTrigger);

  // Update refs when props change
  useEffect(() => {
    prevCloseRef.current = prevClose;
    onRefreshTriggerRef.current = onRefreshTrigger;
  }, [prevClose, onRefreshTrigger]);

  useEffect(() => {
    if (!chartContainer.current) return;

    const formatTime = (time: number) => {
      const date = new Date(time * 1000);
      const h = date.getHours();
      const m = date.getMinutes();
      if (h === 9 && m === 30)
        return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear() % 100}`;
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
      crosshair: {
        vertLine: { visible: true, labelVisible: false },
        horzLine: { visible: true, labelVisible: false }, 
      },
    });

    const lineSeries = chart.addSeries(LineSeries, { color: "#D60A22", lineWidth: 2 });
    seriesRef.current = lineSeries;

    // Tooltip setup
    const tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    tooltip.style.position = "absolute";
    tooltip.style.padding = "6px 10px";
    tooltip.style.background = "#222";
    tooltip.style.color = "#fff";
    tooltip.style.border = "1px solid #555";
    tooltip.style.borderRadius = "4px";
    tooltip.style.pointerEvents = "none";
    tooltip.style.display = "none";
    tooltip.style.fontSize = "12px";
    chartContainer.current.appendChild(tooltip);

    const ws = new WebSocket("ws://localhost:8000/ws/ticks");
    
    ws.onopen = () => console.log("WebSocket connected");
    ws.onclose = () => console.log("WebSocket disconnected");
    ws.onerror = (error) => console.error("WebSocket error:", error);
    
    ws.onmessage = (e) => {
      const tick = JSON.parse(e.data) as {
        time: number;
        close: number;
        open: number;
        high: number;
        low: number;
        volume: number;
      };

      const point: TickData = {
        time: tick.time as Time,
        value: tick.close,
        open: tick.open ?? tick.close,
        high: tick.high ?? tick.close,
        low: tick.low ?? tick.close,
        volume: tick.volume ?? 0,
      };

      buffer.current.push(point);
      seriesRef.current?.update(point);

      // Use the ref to get the current prevClose value
      if (prevCloseRef.current !== null) {
        const color = tick.close >= prevCloseRef.current ? "#00AA76" : "#D60A22";
        seriesRef.current?.applyOptions({ color });
      }

      if (!hasSetInitialRange.current) {
        const firstPrice = point.value;
        chart.priceScale("right").applyOptions({ autoScale: false });
        chart.priceScale("right").setVisibleRange({ from: firstPrice * 0.98, to: firstPrice * 1.02 });
        hasSetInitialRange.current = true;
      }

      // Use the ref to call the refresh trigger
      onRefreshTriggerRef.current();
    };

    // Tooltip hover logic
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.seriesData.size) {
        tooltip.style.display = "none";
        return;
      }

      const seriesData = param.seriesData.get(lineSeries) as TickData | undefined;
      if (!seriesData) return;

      const { value, open, high, low, volume, time } = seriesData;

      const date = new Date((time as number) * 1000);
      const h = date.getHours();
      const m = date.getMinutes();
      const ampm = h >= 12 ? "PM" : "AM";
      const displayH = h % 12 === 0 ? 12 : h % 12;
      const minStr = m < 10 ? `0${m}` : m;
      const dateStr = `${(date.getMonth() + 1).toString().padStart(2, "0")}-${date
        .getDate()
        .toString()
        .padStart(2, "0")} ${displayH}:${minStr}${ampm}`;

      const openValue = open ?? 0;
      const highValue = high ?? 0;
      const lowValue = low ?? 0;
      const closeValue = value ?? 0;

      tooltip.innerHTML = `
        <div><strong>Date:</strong> ${dateStr}</div>
        <div><strong>Close:</strong> ${closeValue.toFixed(2)}</div>
        <div><strong>Open:</strong> ${openValue.toFixed(2)}</div>
        <div><strong>High:</strong> ${highValue.toFixed(2)}</div>
        <div><strong>Low:</strong> ${lowValue.toFixed(2)}</div>
        <div><strong>Volume:</strong> ${volume ?? 0}</div>
      `;

      const point = param.point;
      if (point) {
        tooltip.style.display = "block";
        tooltip.style.left = `${point.x + 15}px`;
        tooltip.style.top = `${point.y + 15}px`;
      }
    });

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
  }, []); // Empty dependency array - no ESLint warnings!

  return <div ref={chartContainer} className="chart-container" />;
}