// ── Candlestick Chart Visualization Block ─────────────
// Renders candles + volume + trade markers + dashed segments.
// Depends on: chart-config (visual), types (data shapes).
// Does NOT know about data loading or backtesting.

"use client";

import { useEffect, useRef, useSyncExternalStore, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import type { Candle, TradeMarker } from "@/types";
import {
  CHART_COLORS,
  CANDLESTICK_CHART_OPTIONS,
  CANDLESTICK_SERIES_OPTIONS,
  VOLUME_SERIES_OPTIONS,
} from "@/lib/chart-config";

// ── Decimal presets ────────────────────────────────────

const DECIMAL_PRESETS = [
  { label: "Auto", value: -1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "4", value: 4 },
  { label: "5", value: 5 },
  { label: "6", value: 6 },
  { label: "8", value: 8 },
];

// ── SSR guard ──────────────────────────────────────────

const emptySubscribe = () => () => {};
function getIsMounted() { return true; }

// ── Props ──────────────────────────────────────────────

interface CandlestickChartProps {
  candles: Candle[];
  isLoading?: boolean;
  trades?: TradeMarker[];
  highlightTradeTime?: number | null;
  // Highlighted trade price dots
  highlightedTrade?: { entryTime: number; entryPrice: number; exitTime: number; exitPrice: number } | null;
}

// ── Component ──────────────────────────────────────────

export default function CandlestickChart({
  candles, isLoading, trades = [], highlightTradeTime = null, highlightedTrade,
}: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  // Highlighted trade: entry dot + exit dot (gray lines at actual price level)
  const hlEntryRef = useRef<ISeriesApi<"Line"> | null>(null);
  const hlExitRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [decimals, setDecimals] = useState(-1);
  // Sync saved decimal precision from localStorage after mount
  useEffect(() => {
    const saved = localStorage.getItem("chart-decimals");
    if (saved !== null) setDecimals(Number(saved));
  }, []);
  const [showDecMenu, setShowDecMenu] = useState(false);
  const decMenuRef = useRef<HTMLDivElement>(null);
  const isFirstDataLoad = useRef(true);

  const mounted = useSyncExternalStore(emptySubscribe, getIsMounted, () => false);

  // Close decimal menu on outside click
  useEffect(() => {
    if (!showDecMenu) return;
    const handler = (e: MouseEvent) => {
      if (decMenuRef.current && !decMenuRef.current.contains(e.target as Node)) {
        setShowDecMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDecMenu]);

  // Auto-detect decimal precision from candle prices
  const autoDecimals = useCallback((c: Candle[]): number => {
    if (c.length === 0) return 2;
    const price = c[0].close;
    if (price >= 10000) return 1;
    if (price >= 100) return 2;
    if (price >= 1) return 4;
    if (price >= 0.01) return 6;
    return 8;
  }, []);

  // Apply decimal precision to candlestick series
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const prec = decimals < 0 ? autoDecimals(candles) : decimals;
    const minMove = Math.pow(10, -prec);
    candleSeriesRef.current.applyOptions({
      priceFormat: { type: "price", precision: prec, minMove },
    } as any);
  }, [decimals, candles, autoDecimals]);

  // ── Init chart (runs once) ───────────────────────────
  useEffect(() => {
    if (!mounted || !chartContainerRef.current || chartRef.current) return;
    const container = chartContainerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    const chart = createChart(container, {
      ...CANDLESTICK_CHART_OPTIONS,
      width,
      height,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, CANDLESTICK_SERIES_OPTIONS);

    const volumeSeries = chart.addSeries(HistogramSeries, VOLUME_SERIES_OPTIONS);
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seriesMarkers = createSeriesMarkers(candleSeries, [], { markersZOrder: "top" } as any);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    markersRef.current = seriesMarkers;

    const observer = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width: w, height: h } = e.contentRect;
        if (w > 0 && h > 0) chart.applyOptions({ width: w, height: h });
      }
    });
    observer.observe(container);
    resizeObserverRef.current = observer;

    return () => {
      if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
      markersRef.current = null;
      hlEntryRef.current = null;
      hlExitRef.current = null;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
        volumeSeriesRef.current = null;
      }
    };
  }, [mounted]);

  // ── Update candles ───────────────────────────────────
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
    // Reset first-load flag when data is cleared (new fetch incoming)
    if (candles.length === 0) { isFirstDataLoad.current = true; return; }
    candleSeriesRef.current.setData(
      candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
    volumeSeriesRef.current.setData(
      candles.map((c) => ({
        time: c.time as Time,
        value: c.volume,
        color: c.close >= c.open
          ? CHART_COLORS.volumeGreen
          : CHART_COLORS.volumeRed,
      }))
    );
    if (isFirstDataLoad.current) {
      chartRef.current?.timeScale().fitContent();
      isFirstDataLoad.current = false;
    }
  }, [candles]);

  // ── Update trade markers ─────────────────────────────
  useEffect(() => {
    if (!markersRef.current) return;
    const markers: SeriesMarker<Time>[] = trades.map((t) => {
      const sz = (highlightTradeTime != null && t.time === highlightTradeTime) ? 2 : 1;
      switch (t.type) {
        case "long-entry":
          return {
            time: t.time as Time, position: "belowBar" as const,
            color: CHART_COLORS.green, shape: "arrowUp" as const, text: "L", size: sz,
          };
        case "long-exit": {
          const r = t.exitReason;
          return {
            time: t.time as Time, position: "aboveBar" as const,
            color: CHART_COLORS.green, shape: "arrowDown" as const,
            text: r === "tp" ? "TP" : r === "sl" ? "SL" : r === "eod" ? "EOD" : "SIG",
            size: sz,
          };
        }
        case "short-entry":
          return {
            time: t.time as Time, position: "aboveBar" as const,
            color: CHART_COLORS.red, shape: "arrowDown" as const, text: "S", size: sz,
          };
        case "short-exit": {
          const r = t.exitReason;
          return {
            time: t.time as Time, position: "belowBar" as const,
            color: CHART_COLORS.red, shape: "arrowUp" as const,
            text: r === "tp" ? "TP" : r === "sl" ? "SL" : r === "eod" ? "EOD" : "SIG",
            size: sz,
          };
        }
        default:
          return {
            time: t.time as Time, position: "belowBar" as const,
            color: "#9ca3af", shape: "circle" as const, text: "?", size: sz,
          };
      }
    });
    markers.sort((a, b) => ((a.time as number) || 0) - ((b.time as number) || 0));
    markersRef.current.setMarkers(markers);
  }, [trades, highlightTradeTime]);

  // ── Highlighted trade: horizontal price lines to right edge ──
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length === 0) return;

    const lastTime = candles[candles.length - 1].time as Time;

    const lineOpts = (color: string) => ({
      color,
      lineWidth: 1 as const,
      lineStyle: 2 as const, // dashed
      lastValueVisible: true,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      pointMarkersVisible: false,
    });

    if (!highlightedTrade) {
      if (hlEntryRef.current) {
        try { chart.removeSeries(hlEntryRef.current); } catch { /* gone */ }
        hlEntryRef.current = null;
      }
      if (hlExitRef.current) {
        try { chart.removeSeries(hlExitRef.current); } catch { /* gone */ }
        hlExitRef.current = null;
      }
      return;
    }

    const { entryTime, entryPrice, exitTime, exitPrice } = highlightedTrade;

    // Entry line: from entry candle to end of chart
    if (!hlEntryRef.current) {
      hlEntryRef.current = chart.addSeries(LineSeries, lineOpts("#22c55e"));
    }
    hlEntryRef.current.setData([
      { time: entryTime as Time, value: entryPrice },
      { time: lastTime, value: entryPrice },
    ]);

    // Exit line: from exit candle to end of chart
    if (!hlExitRef.current) {
      hlExitRef.current = chart.addSeries(LineSeries, lineOpts("#ef4444"));
    }
    hlExitRef.current.setData([
      { time: exitTime as Time, value: exitPrice },
      { time: lastTime, value: exitPrice },
    ]);
  }, [highlightedTrade, candles]);

  // ── Scroll to highlighted trade ──────────────────────
  useEffect(() => {
    if (highlightTradeTime == null || !chartRef.current || candles.length < 2) return;
    const ts = chartRef.current.timeScale();
    try {
      const range = ts.getVisibleRange();
      if (!range) return;
      const rangeWidth = (range.to as number) - (range.from as number);
      const interval = candles[candles.length - 1].time - candles[candles.length - 2].time;
      const halfWidth = Math.max(rangeWidth / 2, interval * 5);
      ts.setVisibleRange({
        from: (highlightTradeTime - halfWidth) as Time,
        to: (highlightTradeTime + halfWidth) as Time,
      });
    } catch { /* ignore */ }
  }, [highlightTradeTime, candles]);

  // ── SSR fallback ─────────────────────────────────────
  if (!mounted) {
    return (
      <div className="w-full h-full min-h-[400px] rounded-lg border border-border bg-card flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Initializing chart...</div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[400px] rounded-lg border border-border bg-card overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
            <span className="text-sm text-muted-foreground">Loading data...</span>
          </div>
        </div>
      )}
      {/* Decimal precision selector — top-right corner */}
      <div ref={decMenuRef} className="absolute top-2 right-2 z-20">
        <button
          onClick={() => setShowDecMenu((v) => !v)}
          className="h-6 px-2 text-[10px] rounded border border-border bg-background/80 backdrop-blur-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <span>{decimals < 0 ? "Auto" : `0.${"0".repeat(decimals - 1)}1`}</span>
          <svg className="h-2.5 w-2.5" viewBox="0 0 10 6" fill="currentColor"><path d="M0 0l5 6 5-6z"/></svg>
        </button>
        {showDecMenu && (
          <div className="absolute top-full right-0 mt-1 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[60px] z-30">
            {DECIMAL_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => { setDecimals(p.value); setShowDecMenu(false); localStorage.setItem("chart-decimals", String(p.value)); }}
                className={`w-full text-left px-2 py-1 text-[10px] hover:bg-accent transition-colors ${
                  decimals === p.value ? "text-foreground font-medium bg-accent/50" : "text-muted-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}