// ── Chart Configuration Block ──────────────────────────
// Visual constants for ALL charts (candlestick + equity).
// Change colors, grid opacity, font sizes HERE only.
// No React, no logic — pure config objects.

import { ColorType, CrosshairMode } from "lightweight-charts";
import type { DeepPartial } from "lightweight-charts";
import type {
  ChartOptions,
  CandlestickSeriesOptions,
  HistogramSeriesOptions,
  LineSeriesOptions,
} from "lightweight-charts";

// ── Colors ─────────────────────────────────────────────

export const CHART_COLORS = {
  green: "#22c55e",
  red: "#ef4444",
  yellow: "#facc15",       // equity line
  text: "#9ca3af",
  volumeGreen: "rgba(34,197,94,0.3)",
  volumeRed: "rgba(239,68,68,0.3)",
  gridLine: "rgba(255,255,255,0.05)",
  border: "rgba(255,255,255,0.1)",
  loadingBg: "rgba(0,0,0,0.8)",
} as const;

// ── Main chart (candlestick) options ───────────────────

export const CANDLESTICK_CHART_OPTIONS: DeepPartial<ChartOptions> = {
  layout: {
    background: { type: ColorType.Solid, color: "transparent" },
    textColor: CHART_COLORS.text,
    fontSize: 12,
  },
  grid: {
    vertLines: { color: CHART_COLORS.gridLine },
    horzLines: { color: CHART_COLORS.gridLine },
  },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: {
    borderColor: CHART_COLORS.border,
    scaleMargins: { top: 0.1, bottom: 0.25 },
  },
  timeScale: {
    borderColor: CHART_COLORS.border,
    timeVisible: true,
    secondsVisible: false,
  },
};

// ── Candlestick series options ─────────────────────────

export const CANDLESTICK_SERIES_OPTIONS: DeepPartial<CandlestickSeriesOptions> = {
  upColor: CHART_COLORS.green,
  downColor: CHART_COLORS.red,
  borderUpColor: CHART_COLORS.green,
  borderDownColor: CHART_COLORS.red,
  wickUpColor: CHART_COLORS.green,
  wickDownColor: CHART_COLORS.red,
  lastValueVisible: true,
  priceLineVisible: false,
};

// ── Volume series options ──────────────────────────────

export const VOLUME_SERIES_OPTIONS: DeepPartial<HistogramSeriesOptions> = {
  priceFormat: { type: "volume" },
  priceScaleId: "volume",
};

// ── Dashed segment (trade entry/exit price line) ────────

export function segmentOptions(color: string): DeepPartial<LineSeriesOptions> {
  return {
    color,
    lineStyle: 2 as const, // Dashed
    lineWidth: 1,
    lastValueVisible: false,
    priceLineVisible: false,
    crosshairMarkerVisible: false,
    pointMarkersVisible: false,
  };
}

// ── Equity chart options ───────────────────────────────

export const EQUITY_CHART_OPTIONS: DeepPartial<ChartOptions> = {
  layout: {
    background: { type: ColorType.Solid, color: "transparent" },
    textColor: CHART_COLORS.text,
    fontSize: 10,
  },
  grid: {
    vertLines: { color: "rgba(255,255,255,0.04)" },
    horzLines: { color: "rgba(255,255,255,0.04)" },
  },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: {
    borderColor: CHART_COLORS.border,
    scaleMargins: { top: 0.05, bottom: 0.05 },
  },
  timeScale: {
    borderColor: CHART_COLORS.border,
    timeVisible: true,
    secondsVisible: false,
    fixLeftEdge: true,
    fixRightEdge: true,
  },
};

export const EQUITY_LINE_OPTIONS: DeepPartial<LineSeriesOptions> = {
  color: CHART_COLORS.yellow,
  lineWidth: 2,
  lastValueVisible: true,
  priceLineVisible: true,
};