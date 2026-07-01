// ── Equity Chart Visualization Block ─────────────────
// Renders equity curve as a line chart.
// Depends on: chart-config (visual options).
// Does NOT know about data loading or backtesting.

"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { EQUITY_CHART_OPTIONS, EQUITY_LINE_OPTIONS } from "@/lib/chart-config";

// ── SSR guard ──────────────────────────────────────────

const emptySubscribe = () => () => {};
function getIsMounted() { return true; }

// ── Props ──────────────────────────────────────────────

interface EquityPoint { time: number; value: number; }

interface EquityChartProps {
  data: EquityPoint[];
}

// ── Component ──────────────────────────────────────────

export default function EquityChart({ data }: EquityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const mounted = useSyncExternalStore(emptySubscribe, getIsMounted, () => false);

  useEffect(() => {
    if (!mounted || !containerRef.current || chartRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 200;

    const chart = createChart(container, { ...EQUITY_CHART_OPTIONS, width, height });
    const lineSeries = chart.addSeries(LineSeries, EQUITY_LINE_OPTIONS);

    chartRef.current = chart;
    lineSeriesRef.current = lineSeries;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) chart.applyOptions({ width: w, height: h });
      }
    });
    observer.observe(container);
    observerRef.current = observer;

    return () => {
      observerRef.current?.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
      lineSeriesRef.current = null;
    };
  }, [mounted]);

  useEffect(() => {
    if (!lineSeriesRef.current || data.length === 0) return;
    lineSeriesRef.current.setData(
      data.map((d) => ({ time: d.time as Time, value: d.value }))
    );
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  if (!mounted) return null;

  return <div ref={containerRef} className="w-full h-full" />;
}