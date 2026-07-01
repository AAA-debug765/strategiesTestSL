// ── Trade Markers Builder Block ────────────────────────
// Converts BacktestResult.trades → chart-ready
// TradeMarker[] and TradeLineInfo[] arrays.
// No React, no charts — pure data transform.

import type { TradeMarker, TradeLineInfo, BatchedTradeLine } from "@/types";
import type { Trade } from "@/strategies/types";

// ── Build marker list for createSeriesMarkers ──────────

export function buildTradeMarkers(
  trades: Trade[],
  highlightTradeTime: number | null
): { markers: TradeMarker[]; highlightTime: number | null } {
  if (!trades.length) return { markers: [], highlightTime: null };

  const markers: TradeMarker[] = [];
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    markers.push({
      time: t.entryTime,
      price: t.entryPrice,
      index: i + 1,
      type: t.type === "long" ? "long-entry" : "short-entry",
    });
    markers.push({
      time: t.exitTime,
      price: t.exitPrice,
      index: i + 1,
      type: t.type === "long" ? "long-exit" : "short-exit",
      exitReason: t.exitReason,
    });
  }

  markers.sort((a, b) => a.time - b.time);

  // Highlight time is the entry time of the highlighted trade
  const ht = highlightTradeTime != null && trades[highlightTradeTime]
    ? trades[highlightTradeTime].entryTime
    : null;

  return { markers, highlightTime: ht };
}

// ── Build line info for dashed price segments ──────────

export function buildTradeLines(trades: Trade[]): TradeLineInfo[] {
  if (!trades.length) return [];
  return trades.map((t) => ({
    entryTime: t.entryTime,
    exitTime: t.exitTime,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    type: t.type,
  }));
}

// ── Batched trade lines: 4 series max (long-entry, long-exit, short-entry, short-exit) ──
// Each series has null gaps between individual trade segments.
// This replaces the old approach of 2 LineSeries per trade (which created 800+ series for 400 trades).

export function buildBatchedTradeLines(
  trades: Trade[],
  candleInterval?: number
): { longEntry: { time: number; value: number }[]; longExit: { time: number; value: number }[]; shortEntry: { time: number; value: number }[]; shortExit: { time: number; value: number }[] } {
  const longEntry: { time: number; value: number }[] = [];
  const longExit: { time: number; value: number }[] = [];
  const shortEntry: { time: number; value: number }[] = [];
  const shortExit: { time: number; value: number }[] = [];

  // Default pad: 1.5x candle interval. Falls back to 60s.
  const pad = (candleInterval ?? 60) * 1.5;

  for (const t of trades) {
    const entryArr = t.type === "long" ? longEntry : shortEntry;
    const exitArr = t.type === "long" ? longExit : shortExit;

    // Null gap before each segment (except the very first point)
    if (entryArr.length > 0) entryArr.push(null as any);
    if (exitArr.length > 0) exitArr.push(null as any);

    entryArr.push({ time: t.entryTime - pad, value: t.entryPrice });
    entryArr.push({ time: t.entryTime + pad, value: t.entryPrice });

    exitArr.push({ time: t.exitTime - pad, value: t.exitPrice });
    exitArr.push({ time: t.exitTime + pad, value: t.exitPrice });
  }

  return { longEntry, longExit, shortEntry, shortExit };
}