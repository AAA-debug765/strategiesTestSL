// ── Shared types & constants for the entire app ──────────
// This is the SINGLE source of truth for core data structures.
// Changing anything here propagates everywhere — do it carefully.

// ── Candle data ─────────────────────────────────────────

export interface Candle {
  time: number;   // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ── Trading pairs ───────────────────────────────────────

export const SYMBOLS = [
  "TONUSDT", "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
  "ADAUSDT", "DOGEUSDT", "DOTUSDT", "AVAXUSDT", "MATICUSDT",
  "LINKUSDT", "LTCUSDT", "ATOMUSDT", "UNIUSDT", "NEARUSDT",
] as const;

export type Symbol = (typeof SYMBOLS)[number];

// ── Time intervals ──────────────────────────────────────

export interface IntervalOption {
  value: string;
  label: string;
}

export const INTERVALS: IntervalOption[] = [
  { value: "1m",  label: "1m"  },
  { value: "3m",  label: "3m"  },
  { value: "5m",  label: "5m"  },
  { value: "15m", label: "15m" },
  { value: "30m", label: "30m" },
  { value: "1h",  label: "1h"  },
  { value: "2h",  label: "2h"  },
  { value: "4h",  label: "4h"  },
  { value: "6h",  label: "6h"  },
  { value: "8h",  label: "8h"  },
  { value: "12h", label: "12h" },
  { value: "1d",  label: "1d"  },
  { value: "3d",  label: "3d"  },
  { value: "1w",  label: "1w"  },
  { value: "1M",  label: "1M"  },
];

export type Interval = (typeof INTERVALS)[number]["value"];

// ── Date helpers ────────────────────────────────────────

export function getDateDaysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// ── Trade visualization types (chart layer) ────────────

export interface TradeMarker {
  time: number;
  price: number;
  index: number;
  type: "long-entry" | "long-exit" | "short-entry" | "short-exit";
  exitReason?: "signal" | "tp" | "sl" | "eod";
}

export interface TradeLineInfo {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  type: "long" | "short";
}

// Batched trade lines — 2 series total (entry-prices, exit-prices)
// instead of 2 per trade. Each series uses null gaps between trades.
export interface BatchedTradeLine {
  type: "long" | "short";
  entrySegments: { time: number; value: number }[];
  exitSegments: { time: number; value: number }[];
}