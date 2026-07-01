// ── Data Loading Block ──────────────────────────────────
// Isolates ALL data-fetching logic for Binance klines.
// The chart and strategy blocks NEVER touch fetch code.

import { useState, useCallback, useRef } from "react";
import type { Candle } from "@/types";
import { formatDate } from "@/types";
import { getDateDaysAgo } from "@/types";

export interface DataLoaderState {
  candles: Candle[];
  isLoading: boolean;
  error: string | null;
  lastFetched: string | null;
  symbol: string;
  setSymbol: (s: string) => void;
  interval: string;
  setInterval: (i: string) => void;
  startDate: string;
  setStartDate: (d: string) => void;
  endDate: string;
  setEndDate: (d: string) => void;
  fetchData: () => Promise<void>;
}

export function useDataLoader(): DataLoaderState {
  const [symbol, setSymbol] = useState("TONUSDT");
  const [interval, setInterval] = useState("1m");
  const [startDate, setStartDate] = useState(formatDate(getDateDaysAgo(7)));
  const [endDate, setEndDate] = useState(formatDate(new Date()));
  const [candles, setCandles] = useState<Candle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setIsLoading(true);
    setError(null);

    const startMs = new Date(`${startDate}T00:00:00`).getTime();
    const endMs = new Date(`${endDate}T23:59:59.999`).getTime();

    if (startMs >= endMs) {
      setError("Start date must be before end date.");
      setIsLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({
        symbol,
        interval,
        startTime: String(startMs),
        endTime: String(endMs),
      });
      const response = await fetch(`/api/binance?${params.toString()}`, {
        signal: abortRef.current.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.candles.length === 0) {
        setError("No data found.");
        setCandles([]);
      } else {
        setCandles(data.candles);
        setLastFetched(
          new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          })
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to fetch data.");
      setCandles([]);
    } finally {
      setIsLoading(false);
    }
  }, [symbol, interval, startDate, endDate]);

  return {
    candles,
    isLoading,
    error,
    lastFetched,
    symbol,
    setSymbol,
    interval,
    setInterval,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    fetchData,
  };
}