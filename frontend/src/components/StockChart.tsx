import { useEffect, useRef } from "react";
import { createChart, LineSeries, ColorType } from "lightweight-charts";
import type {
  IChartApi,
  ISeriesApi,
  Time,
  SeriesDataItemTypeMap,
} from "lightweight-charts";

interface TickData {
  time: number;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

interface StockChartProps {
  prevClose: number | null;
  onRefreshTrigger: () => void;
  onNewTick?: (tick: TickData) => void;
}

export function StockChart({ prevClose, onRefreshTrigger, onNewTick }: StockChartProps) {
  const chartContainer = useRef<HTMLDivElement | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const buffer = useRef<TickData[]>([]);
  const hasSetInitialRange = useRef(false);
  const prevCloseRef = useRef(prevClose);
  const onRefreshTriggerRef = useRef(onRefreshTrigger);
  const onNewTickRef = useRef(onNewTick);


  useEffect(() => {
    prevCloseRef.current = prevClose;
    onRefreshTriggerRef.current = onRefreshTrigger;
    onNewTickRef.current = onNewTick;
  }, [prevClose, onRefreshTrigger, onNewTick]);

  useEffect(() => {
    if (!chartContainer.current) return;

    // When creating the chart:
    const chart: IChartApi = createChart(chartContainer.current, {
      width: chartContainer.current.clientWidth,
      height: chartContainer.current.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#000" },
        textColor: "#fff",
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: {
        vertLine: { visible: true, labelVisible: false },
        horzLine: { visible: true, labelVisible: false },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        tickMarkFormatter: (time: number) => {
          const date = new Date(time * 1000); // convert UNIX timestamp
          const h = date.getHours();
          const m = date.getMinutes();

          // If market open 9:30am, show date
          if (h === 9 && m === 30) {
            const month = (date.getMonth() + 1).toString().padStart(2, "0");
            const day = date.getDate().toString().padStart(2, "0");
            return `${month}-${day}`;
          }

          const ampm = h >= 12 ? "PM" : "AM";
          const displayH = h % 12 === 0 ? 12 : h % 12;
          const minStr = m < 10 ? `0${m}` : m;
          return `${displayH}:${minStr} ${ampm}`;
        },
      },
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: "#D60A22",
      lineWidth: 2,
    });
    seriesRef.current = lineSeries;

    // Tooltip
    const tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    Object.assign(tooltip.style, {
      position: "absolute",
      padding: "6px 10px",
      background: "#222",
      color: "#fff",
      border: "1px solid #555",
      borderRadius: "4px",
      pointerEvents: "none",
      display: "none",
      fontSize: "12px",
    });
    chartContainer.current.appendChild(tooltip);

    // WebSocket
    const ws = new WebSocket("ws://localhost:8000/ws/ticks");

    ws.onmessage = (e) => {
      const tick = JSON.parse(e.data) as TickData;
      buffer.current.push(tick);

      // Update line series
      seriesRef.current?.update({ time: tick.time as Time, value: tick.close });

      if (onNewTickRef.current) {
        onNewTickRef.current(tick);
      }

      // Color based on prevClose
      if (prevCloseRef.current !== null) {
        seriesRef.current?.applyOptions({
          color: tick.close >= prevCloseRef.current ? "#00AA76" : "#D60A22",
        });
      }

      // Initial price range
      if (!hasSetInitialRange.current) {
        chart.priceScale("right").applyOptions({ autoScale: false });
        chart
          .priceScale("right")
          .setVisibleRange({ from: tick.close * 0.98, to: tick.close * 1.02 });
        hasSetInitialRange.current = true;
      }

      onRefreshTriggerRef.current();
    };

    // Tooltip hover
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.seriesData.size) {
        tooltip.style.display = "none";
        return;
      }

      const lineData = param.seriesData.get(
        lineSeries
      ) as SeriesDataItemTypeMap["Line"];
      if (!lineData) return;

      const hoveredTick = buffer.current.find(
        (t) => t.time === (lineData.time as number)
      );
      if (!hoveredTick) return;

      const date = new Date(hoveredTick.time * 1000);
      const h = date.getHours();
      const m = date.getMinutes();
      const ampm = h >= 12 ? "PM" : "AM";
      const displayH = h % 12 === 0 ? 12 : h % 12;
      const minStr = m < 10 ? `0${m}` : m;
      const dateStr = `${(date.getMonth() + 1)
        .toString()
        .padStart(2, "0")}-${date
        .getDate()
        .toString()
        .padStart(2, "0")} ${displayH}:${minStr}${ampm}`;

      tooltip.innerHTML = `
        <div><strong>Date:</strong> ${dateStr}</div>
        <div><strong>Close:</strong> ${hoveredTick.close.toFixed(2)}</div>
        <div><strong>Open:</strong> ${hoveredTick.open.toFixed(2)}</div>
        <div><strong>High:</strong> ${hoveredTick.high.toFixed(2)}</div>
        <div><strong>Low:</strong> ${hoveredTick.low.toFixed(2)}</div>
        <div><strong>Volume:</strong> ${hoveredTick.volume.toLocaleString()}</div>
      `;

      if (param.point) {
        tooltip.style.display = "block";
        tooltip.style.left = `${param.point.x + 15}px`;
        tooltip.style.top = `${param.point.y + 15}px`;
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
  }, []);

  return <div ref={chartContainer} className="chart-container" />;
}
