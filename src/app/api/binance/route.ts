import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BINANCE_BASE = "https://api.binance.com/api/v3/klines";

// Interval duration in milliseconds
const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "6h": 21_600_000,
  "8h": 28_800_000,
  "12h": 43_200_000,
  "1d": 86_400_000,
  "3d": 259_200_000,
  "1w": 604_800_000,
  "1M": 2_592_000_000,
};

const MAX_LIMIT = 1000;

async function fetchBatch(symbol: string, interval: string, startTime: number, endTime: number): Promise<unknown[][]> {
  const url = `${BINANCE_BASE}?symbol=${symbol}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=${MAX_LIMIT}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Binance API error: ${res.status} - ${text}`);
  }
  return res.json();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");
    const interval = searchParams.get("interval");
    const startTimeStr = searchParams.get("startTime");
    const endTimeStr = searchParams.get("endTime");

    if (!symbol || !interval) {
      return NextResponse.json({ error: "symbol and interval are required" }, { status: 400 });
    }
    if (!startTimeStr || !endTimeStr) {
      return NextResponse.json({ error: "startTime and endTime are required" }, { status: 400 });
    }

    const startTime = Number(startTimeStr);
    const endTime = Number(endTimeStr);
    if (startTime >= endTime) {
      return NextResponse.json({ error: "startTime must be less than endTime" }, { status: 400 });
    }

    const iMs = INTERVAL_MS[interval] || 60_000;

    const allKlines: unknown[][] = [];
    let cursor = startTime;

    while (cursor < endTime) {
      const batch = await fetchBatch(symbol, interval, cursor, endTime);
      if (!batch || batch.length === 0) break;

      allKlines.push(...batch);

      // Move cursor past the last candle's close time
      const lastOpenTime = Number(batch[batch.length - 1][0]);
      cursor = lastOpenTime + iMs;

      // If we got fewer than max, we've reached the end
      if (batch.length < MAX_LIMIT) break;
    }

    const candles = allKlines.map((k) => ({
      time: Math.floor(Number(k[0]) / 1000),
      open: parseFloat(String(k[1])),
      high: parseFloat(String(k[2])),
      low: parseFloat(String(k[3])),
      close: parseFloat(String(k[4])),
      volume: parseFloat(String(k[5])),
    }));

    return NextResponse.json(
      { candles, count: candles.length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[binance] ERROR:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch from Binance" },
      { status: 500 }
    );
  }
}