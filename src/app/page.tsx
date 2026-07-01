// ── Page Layout Block ─────────────────────────────────
// Top bar (symbol/interval/dates) + main content area.
// Depends on: use-data-loader (fetching), trade-markers (builders), types.
// Does NOT contain any chart rendering or backtesting logic.

"use client";

import { useMemo, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, TrendingUp, Loader2, AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import CandlestickChart from "@/components/candlestick-chart";
import { StrategyProvider, useStrategy } from "@/components/strategy-context";
import { StrategyConfig, TradesPanel } from "@/components/strategy-panel";
import { BuildBadge } from "@/components/build-badge";
import { useDataLoader } from "@/hooks/use-data-loader";
import { buildTradeMarkers } from "@/lib/trade-markers";
import { SYMBOLS, INTERVALS, getDateDaysAgo, formatDate } from "@/types";

// ── Inner content (needs strategy context) ─────────────

function AppContent({ candles, isLoading }: { candles: import("@/types").Candle[]; isLoading: boolean }) {
  const { backtestResult, highlightedTrade } = useStrategy();

  const { markers, highlightTime } = useMemo(
    () => buildTradeMarkers(backtestResult?.trades ?? [], highlightedTrade),
    [backtestResult, highlightedTrade]
  );

  // Data for highlighted trade price dots on chart
  const highlightedTradeData = useMemo(() => {
    if (highlightedTrade == null || !backtestResult?.trades[highlightedTrade]) return null;
    const t = backtestResult.trades[highlightedTrade];
    return { entryTime: t.entryTime, entryPrice: t.entryPrice, exitTime: t.exitTime, exitPrice: t.exitPrice };
  }, [highlightedTrade, backtestResult]);

  return (
    <div className="flex-1 flex min-h-0">
      {/* LEFT — Chart + Trades */}
      <div className="flex-1 min-w-0 flex flex-col border-r border-border">
        <div className="flex-1 min-h-0">
          {candles.length > 0 ? (
            <CandlestickChart
              candles={candles}
              isLoading={isLoading}
              trades={markers}
              highlightTradeTime={highlightTime}
              highlightedTrade={highlightedTradeData}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3 px-8">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto">
                  <TrendingUp className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">Load data to see the chart</p>
              </div>
            </div>
          )}
        </div>
        {candles.length > 0 && (
          <div className="shrink-0 h-[33.333vh] overflow-y-auto border-t border-border bg-card">
            <TradesPanel />
          </div>
        )}
      </div>

      {/* RIGHT — Strategy panel 30% */}
      <div className="w-[30%] shrink-0 overflow-y-auto">
        <div className="p-3 space-y-3">
          <StrategyConfig />
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────

export default function Home() {
  const {
    candles, isLoading, error, lastFetched,
    symbol, setSymbol,
    interval, setInterval,
    startDate, setStartDate,
    endDate, setEndDate,
    fetchData,
  } = useDataLoader();

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* ── Top Bar ──────────────────────────────────── */}
      <header className="shrink-0 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
              <TrendingUp className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold hidden sm:inline">Backtester</span>
          </div>
          <div className="h-5 w-px bg-border shrink-0" />
          <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto">
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{SYMBOLS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={interval} onValueChange={setInterval}>
              <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{INTERVALS.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-7 w-[130px] text-xs" />
            <span className="text-muted-foreground text-xs shrink-0">&mdash;</span>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-7 w-[130px] text-xs" />
            <Button onClick={fetchData} disabled={isLoading} size="sm" className="h-7 gap-1.5 text-xs shrink-0">
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              {isLoading ? "Loading..." : "Load"}
            </Button>
          </div>
          <div className="flex-1" />
          {lastFetched && (
            <Badge variant="secondary" className="text-[10px] shrink-0 hidden md:inline-flex">
              {candles.length.toLocaleString()} candles &middot; {lastFetched}
            </Badge>
          )}
          <BuildBadge />
        </div>
        {error && (
          <div className="px-4 pb-2">
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          </div>
        )}
      </header>

      {/* ── Main Content ──────────────────────────────── */}
      <StrategyProvider candles={candles}>
        <AppContent candles={candles} isLoading={isLoading} />
      </StrategyProvider>
    </div>
  );
}