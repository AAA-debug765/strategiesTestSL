"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Play,
  Search,
  Loader2,
  Target,
  Trophy,
  
  ArrowUpCircle,
  ArrowDownCircle,
  AlertCircle,
  Clock,
  Zap,
  DollarSign,
  ShieldAlert,
} from "lucide-react";
import { useStrategy, type FeeSettings } from "./strategy-context";
import EquityChart from "./equity-chart";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ── Helpers ────────────────────────────────────────────

function fmtPct(n: number, d = 2) { return `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`; }
function fmtUsdt(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1000) return `${n >= 0 ? "+" : "-"}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (abs >= 1) return `${n >= 0 ? "+" : "-"}$${abs.toFixed(2)}`;
  return `${n >= 0 ? "+" : "-"}$${abs.toFixed(4)}`;
}
function fmtPrice(n: number) {
  if (n >= 1000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}
function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

const STEP_OPTIONS = [1, 0.1, 0.01, 0.001];

function decimalsFromStep(step: number): number {
  const s = String(step);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

// ── WheelInput (non-passive wheel to change value) ────

function WheelInput({
  value,
  onChange,
  step,
  min,
  max,
  className,
  placeholder,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min?: number;
  max?: number;
  className?: string;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const decimals = decimalsFromStep(step);

  const displayVal = value === 0 ? "" : value.toFixed(decimals);

  const clamp = useCallback((v: number) => {
    let clamped = Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals);
    if (min != null) clamped = Math.max(min, clamped);
    if (max != null) clamped = Math.min(max, clamped);
    return clamped;
  }, [decimals, min, max]);

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? step : -step;
    const newVal = clamp(value + delta);
    if (newVal !== value) onChange(newVal);
  }, [value, step, clamp, onChange]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={displayVal}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9.]/g, "");
        if (raw === "" || raw === ".") { onChange(0); return; }
        const parsed = parseFloat(raw);
        if (!isNaN(parsed)) onChange(clamp(parsed));
      }}
      onFocus={(e) => e.target.select()}
      suppressHydrationWarning
      className={`h-5 text-[10px] w-[52px] px-1 bg-background border border-input rounded outline-none focus:ring-1 focus:ring-ring ${className ?? ""}`}
    />
  );
}

// ── Step Select ────────────────────────────────────────

function StepSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(parseFloat(v))}>
      <SelectTrigger className="h-6 text-[10px] w-[42px] px-1">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="min-w-[80px]">
        {STEP_OPTIONS.map((s) => (
          <SelectItem key={s} value={String(s)} className="text-xs py-1.5">{s}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Progress Card ──────────────────────────────────────

function OptimizeProgress() {
  const { optProgress, isOptimizing, funnelMode } = useStrategy();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isOptimizing) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [isOptimizing]);

  const { current, total, startTime } = optProgress;
  if (!isOptimizing || total === 0) return null;

  const remaining = total - current;
  const pct = Math.round((current / total) * 100);
  const elapsed = startTime ? now - startTime : 0;
  const rate = elapsed > 0 ? current / (elapsed / 1000) : 0;
  const eta = rate > 0 ? remaining / rate : 0;

  return (
    <div className="space-y-1.5 p-2 rounded-md bg-muted/50 border border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px]">
          <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />
          <span className="text-muted-foreground">
            {current.toLocaleString()} / {total.toLocaleString()}
            <span className="ml-1 text-blue-400">({remaining.toLocaleString()} left)</span>
          </span>
          <span className="font-mono font-medium">{pct}%</span>
          {funnelMode && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium">Funnel</span>
          )}
          {optProgress.phase && (
            <span className="text-[9px] text-muted-foreground font-medium">{optProgress.phase}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {formatElapsed(elapsed)}
          </span>
          {eta > 1 && (
            <span className="flex items-center gap-0.5">
              <Zap className="h-2.5 w-2.5" />
              ~{formatElapsed(eta * 1000)}
            </span>
          )}
          {rate > 0 && (
            <span className="font-mono">{rate.toFixed(0)}/s</span>
          )}
        </div>
      </div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Error Display ──────────────────────────────────────

function ErrorBlock({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-2.5">
      <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
      <p className="text-[10px] text-destructive flex-1 leading-relaxed">{message}</p>
      <button
        onClick={onDismiss}
        className="text-[10px] text-muted-foreground hover:text-foreground shrink-0 leading-none"
      >
        x
      </button>
    </div>
  );
}


function FeeConfigCard() {
  const { feeSettings, setFeeSettings } = useStrategy();

  const update = (key: keyof FeeSettings, val: number | string | boolean) => {
    setFeeSettings((prev) => ({ ...prev, [key]: val }));
  };

  return (
    <Card>
      <CardHeader className="px-3 py-1 pb-0">
        <CardTitle className="text-xs font-medium flex items-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5" />
          Capital / TP / SL / Fee
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          {/* Cap */}
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <span className="text-[10px] text-muted-foreground shrink-0">Cap</span>
            <Input type="number" value={feeSettings.initialCapital}
              onChange={(e) => update("initialCapital", parseFloat(e.target.value) || 0)}
              className="h-6 text-[10px] w-full min-w-0 px-1" step={100} min={0} />
          </div>
          {/* TP */}
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <span className="text-[10px] text-muted-foreground shrink-0">TP</span>
            <Input type="number"
              value={feeSettings.tpPrice}
              onChange={(e) => { const v = parseFloat(e.target.value) || 0; update("tpPrice", v); }}
              className="h-6 text-[10px] w-full min-w-0 px-1" step={feeSettings.tpStep} min={0} />
            <Select value={String(feeSettings.tpStep)} onValueChange={(v) => update("tpStep", parseFloat(v))}>
              <SelectTrigger className="h-6 text-[10px] w-[42px] shrink-0 px-0.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="min-w-[60px]">
                {STEP_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)} className="text-xs py-1">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* SL */}
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <span className="text-[10px] text-muted-foreground shrink-0">SL</span>
            <Input type="number"
              value={feeSettings.slPrice}
              onChange={(e) => { const v = parseFloat(e.target.value) || 0; update("slPrice", v); }}
              className="h-6 text-[10px] w-full min-w-0 px-1" step={feeSettings.slStep} min={0} />
            <Select value={String(feeSettings.slStep)} onValueChange={(v) => update("slStep", parseFloat(v))}>
              <SelectTrigger className="h-6 text-[10px] w-[42px] shrink-0 px-0.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="min-w-[60px]">
                {STEP_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)} className="text-xs py-1">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Fee */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-muted-foreground shrink-0">Fee%</span>
            <Input type="number" value={feeSettings.feePct}
              onChange={(e) => update("feePct", parseFloat(e.target.value) || 0)}
              className="h-6 text-[10px] w-[50px] px-1" step={0.01} min={0} max={1} />
          </div>
          {/* Exit on Signal checkbox */}
          <label className="shrink-0 flex items-center gap-1 cursor-pointer select-none">
            <span className="text-[10px] text-muted-foreground">Sig</span>
            <input
              type="checkbox"
              checked={feeSettings.exitOnSignal}
              onChange={(e) => update("exitOnSignal", e.target.checked)}
              className="h-3.5 w-3.5 accent-green-500 cursor-pointer"
            />
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
// ── Right Sidebar ──────────────────────────────────────

export function StrategyConfig() {
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    allStrategies, strategies, selectedId, setSelectedId, selectedStrategy,
    paramValues, setParamValues, paramRanges, setParamRanges,
    backtestResult, isBacktesting, backtestError, setBacktestError,
    isOptimizing, optError, setOptError,
    optProgress, optResults,
    runBacktest, runOptimize, cancelOptimize, selectBestResult, saveAndApplyResult,
    feeSettings,
    funnelMode, setFunnelMode,
  } = useStrategy();

  // Block page scroll when focused on a number input inside this panel
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const handler = (e: WheelEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest && el.closest('input[type="number"]')) {
        e.stopPropagation();
      }
    };
    panel.addEventListener('wheel', handler, { passive: false });
    return () => panel.removeEventListener('wheel', handler);
  }, []);

  const comboCount = useMemo(() => {
    if (!selectedStrategy) return 0;
    let total = 1;
    for (const p of selectedStrategy.parameters) {
      const r = paramRanges[p.name];
      const lo = r?.min ?? p.min;
      const hi = r?.max ?? p.max;
      const step = r?.step ?? p.step;
      if (step <= 0 || hi < lo) return 0;
      const count = Math.floor((hi - lo) / step) + 1;
      total *= count;
    }
    return total;
  }, [selectedStrategy, paramRanges]);

  const comboLabel = comboCount >= 1_000_000
    ? `${(comboCount / 1_000_000).toFixed(1)}M`
    : comboCount >= 1_000
    ? `${(comboCount / 1_000).toFixed(1)}K`
    : String(comboCount);

  const capitalK = (feeSettings.initialCapital / 1000).toFixed(
    feeSettings.initialCapital % 1000 === 0 ? 0 : 1
  );
  const capitalLabel = feeSettings.initialCapital >= 1000
    ? `$${capitalK}k`
    : `$${feeSettings.initialCapital}`;

  return (
    <div ref={panelRef} className="space-y-3">
      {/* ── Strategy Config ─────────────────────────── */}
      <Card>
        <CardHeader className="p-3 pb-0">
          <CardTitle className="text-xs font-medium flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" />
            Strategy
            <Badge variant="outline" className="text-[9px] px-1.5 ml-auto">FUTURES</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-3">
          <div className="flex items-end gap-2">
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {strategies.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={runBacktest} disabled={isBacktesting || isOptimizing} size="sm" className="h-7 gap-1.5 text-xs">
              {isBacktesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Run
            </Button>
            <Button variant="outline" onClick={runOptimize} disabled={isBacktesting || isOptimizing} size="sm" className="h-7 gap-1.5 text-xs">
              {isOptimizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              Optimize
            </Button>
            <span className={`text-[10px] tabular-nums shrink-0 ${comboCount > 500_000 ? "text-red-400" : comboCount > 50_000 ? "text-yellow-400" : "text-muted-foreground"}`}>
              {comboLabel}
            </span>
            <label className="shrink-0 flex items-center gap-1 cursor-pointer select-none">
              <span className="text-[10px] text-muted-foreground">Funnel</span>
              <input
                type="checkbox"
                checked={funnelMode}
                onChange={(e) => setFunnelMode(e.target.checked)}
                className="h-3.5 w-3.5 accent-foreground cursor-pointer"
              />
            </label>
            {isOptimizing && (
              <Button variant="ghost" size="sm" onClick={cancelOptimize} className="h-7 text-[10px] px-2">Stop</Button>
            )}
          </div>

          {selectedStrategy && (
            <p className="text-[10px] text-muted-foreground leading-relaxed">{selectedStrategy.description}</p>
          )}

          {selectedStrategy && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] h-6 py-0">Param</TableHead>
                  <TableHead className="text-[10px] h-6 py-0 w-[60px]">Value</TableHead>
                  <TableHead className="text-[10px] h-6 py-0 w-[55px]">Min</TableHead>
                  <TableHead className="text-[10px] h-6 py-0 w-[55px]">Max</TableHead>
                  <TableHead className="text-[10px] h-6 py-0 w-[60px]">Step</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedStrategy.parameters.map((p) => (
                  <TableRow key={p.name}>
                    <TableCell className="text-[10px] font-medium py-1">{p.label}</TableCell>
                    <TableCell className="py-1">
                      <Input type="number" value={paramValues[p.name] ?? p.default}
                        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) setParamValues((prev) => ({ ...prev, [p.name]: v })); }}
                        className="h-5 text-[10px] w-[60px] px-1.5" step={p.step} min={0} />
                    </TableCell>
                    <TableCell className="py-1">
                      <Input type="number" value={paramRanges[p.name]?.min ?? p.min}
                        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) setParamRanges((prev) => ({ ...prev, [p.name]: { ...prev[p.name], min: v } })); }}
                        className="h-5 text-[10px] w-[55px] px-1.5" step={p.step} min={0} />
                    </TableCell>
                    <TableCell className="py-1">
                      <Input type="number" value={paramRanges[p.name]?.max ?? p.max}
                        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) setParamRanges((prev) => ({ ...prev, [p.name]: { ...prev[p.name], max: v } })); }}
                        className="h-5 text-[10px] w-[55px] px-1.5" step={p.step} min={0} />
                    </TableCell>
                    <TableCell className="py-1">
                      <Input type="number" value={paramRanges[p.name]?.step ?? p.step}
                        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) setParamRanges((prev) => ({ ...prev, [p.name]: { ...prev[p.name], step: v } })); }}
                        className="h-5 text-[10px] w-[60px] px-1.5" min={0} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <OptimizeProgress />

          {backtestError && (
            <ErrorBlock message={backtestError} onDismiss={() => setBacktestError(null)} />
          )}

          {optError && (
            <ErrorBlock message={optError} onDismiss={() => setOptError(null)} />
          )}
        </CardContent>
      </Card>

      {/* ── TP / SL / Fee Card ──────────────────────── */}
      <FeeConfigCard />

      {/* ── Metrics ─────────────────────────────────── */}
      {backtestResult && (
        <>
          <Card className="border-border/50">
            <CardContent className="px-2 py-1.5">
              <div className="flex items-center gap-1">
                <ShieldAlert className={`h-3 w-3 ${backtestResult.metrics.maxConsecutiveSl <= 2 ? "text-green-500" : backtestResult.metrics.maxConsecutiveSl <= 5 ? "text-yellow-500" : "text-red-500"}`} />
                <span className="text-[9px] text-muted-foreground">Max SL подряд</span>
              </div>
              <p className={`text-sm font-bold ${backtestResult.metrics.maxConsecutiveSl <= 2 ? "text-green-500" : backtestResult.metrics.maxConsecutiveSl <= 5 ? "text-yellow-500" : "text-red-500"}`}>
                {backtestResult.metrics.maxConsecutiveSl}
              </p>
            </CardContent>
          </Card>

          {/* Equity Curve */}
          <Card>
            <CardHeader className="p-2 pb-0">
              <CardTitle className="text-[10px] font-medium">Equity Curve ({capitalLabel})</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <div className="h-[200px]">
                <EquityChart data={backtestResult.equityCurve} />
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Optimization Results ─────────────────────── */}
      {optResults.length > 0 && (
        <Card>
          <CardHeader className="p-2 pb-0">
            <CardTitle className="text-[10px] font-medium flex items-center gap-1.5">
              <Trophy className="h-3 w-3" />
              Top {Math.min(optResults.length, 30)}
              <Badge variant="secondary" className="text-[9px] px-1.5">{optResults.length} tested</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <div className="max-h-[350px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] h-6 py-0">#</TableHead>
                    <TableHead className="text-[10px] h-6 py-0">SL подряд</TableHead>
                    <TableHead className="text-[10px] h-6 py-0">Trades</TableHead>
                    {selectedStrategy?.parameters.map((p) => (
                      <TableHead key={p.name} className="text-[10px] h-6 py-0">{p.label}</TableHead>
                    ))}
                    <TableHead className="text-[10px] h-6 py-0 w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {optResults.slice(0, 30).map((r, i) => (
                    <TableRow
                      key={i}
                      className={`${i === 0 ? "bg-yellow-500/5" : ""} cursor-pointer`}
                      onDoubleClick={() => saveAndApplyResult(r)}
                      title="Double-click to save & apply"
                    >
                      <TableCell className="text-[10px] py-0.5 font-medium">{i + 1}</TableCell>
                      <TableCell className={`text-[10px] py-0.5 font-mono font-bold ${r.metrics.maxConsecutiveSl <= 2 ? "text-green-500" : r.metrics.maxConsecutiveSl <= 5 ? "text-yellow-500" : "text-red-500"}`}>
                        {r.metrics.maxConsecutiveSl}
                      </TableCell>
                      <TableCell className="text-[10px] py-0.5 font-mono">{r.metrics.totalTrades}</TableCell>
                      {selectedStrategy?.parameters.map((p) => (
                        <TableCell key={p.name} className="text-[10px] py-0.5 font-mono">{r.params[p.name]}</TableCell>
                      ))}
                      <TableCell className="py-0.5">
                        <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5" onClick={() => selectBestResult(r)}>View</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-[9px] text-muted-foreground mt-1.5">Double-click a row to save params (persisted on reload)</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Trades Panel ───────────────────────────────────────

export function TradesPanel() {
  const { backtestResult, highlightedTrade, setHighlightedTrade } = useStrategy();

  const trades = backtestResult?.trades ?? [];

  return (
    <Card className="border-0 rounded-none">
      <CardHeader className="p-2 pb-0">
        <CardTitle className="text-[10px] font-medium flex items-center gap-2">
          Trades
          <Badge variant="secondary" className="text-[9px] px-1.5">{trades.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2">
        {!backtestResult || trades.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-4">Run a backtest to see trades</p>
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] h-6 py-0">#</TableHead>
              <TableHead className="text-[10px] h-6 py-0">Type</TableHead>
              <TableHead className="text-[10px] h-6 py-0">Entry</TableHead>
              <TableHead className="text-[10px] h-6 py-0">Price In</TableHead>
              <TableHead className="text-[10px] h-6 py-0">Price Out</TableHead>
              <TableHead className="text-[10px] h-6 py-0">PnL %</TableHead>
              <TableHead className="text-[10px] h-6 py-0">PnL $</TableHead>
              <TableHead className="text-[10px] h-6 py-0">Fee $</TableHead>
              <TableHead className="text-[10px] h-6 py-0">Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trades.map((t, i) => {
              const d = new Date(t.entryTime * 1000);
              const isWin = t.pnl > 0;
              const isHighlighted = highlightedTrade === i;
              return (
                <TableRow
                  key={i}
                  className={`cursor-pointer ${isHighlighted ? "bg-yellow-500/15" : "hover:bg-muted/50"}`}
                  onClick={() => setHighlightedTrade(isHighlighted ? null : i)}
                >
                  <TableCell className="text-[10px] py-0.5">{i + 1}</TableCell>
                  <TableCell className="text-[10px] py-0.5">
                    {t.type === "long" ? (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 text-green-500 border-green-500/30 bg-green-500/5">
                        <ArrowUpCircle className="h-2.5 w-2.5 mr-0.5" />
                        LONG
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 text-red-500 border-red-500/30 bg-red-500/5">
                        <ArrowDownCircle className="h-2.5 w-2.5 mr-0.5" />
                        SHORT
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-[10px] py-0.5 font-mono">
                    {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                    {d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                  </TableCell>
                  <TableCell className="text-[10px] py-0.5 font-mono">{fmtPrice(t.entryPrice)}</TableCell>
                  <TableCell className="text-[10px] py-0.5 font-mono">{fmtPrice(t.exitPrice)}</TableCell>
                  <TableCell className={`text-[10px] py-0.5 font-mono ${isWin ? "text-green-500" : "text-red-500"}`}>
                    {fmtPct(t.pnlPct)}
                  </TableCell>
                  <TableCell className={`text-[10px] py-0.5 font-mono ${isWin ? "text-green-500" : "text-red-500"}`}>
                    {fmtUsdt(t.pnl)}
                  </TableCell>
                  <TableCell className="text-[10px] py-0.5 font-mono text-muted-foreground">
                    {t.fee > 0 ? `-$${t.fee.toFixed(2)}` : "-"}
                  </TableCell>
                  <TableCell className="text-[10px] py-0.5">
                    {t.exitReason === "tp" && <Badge variant="outline" className="text-[8px] px-1 py-0 text-green-400 border-green-400/30">TP</Badge>}
                    {t.exitReason === "sl" && <Badge variant="outline" className="text-[8px] px-1 py-0 text-red-400 border-red-400/30">SL</Badge>}
                    {t.exitReason === "signal" && <span className="text-[9px] text-muted-foreground">SIG</span>}
                    {t.exitReason === "eod" && <span className="text-[9px] text-muted-foreground">EOD</span>}
                    {!t.exitReason && <span className="text-[9px] text-muted-foreground">-</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        )}
      </CardContent>
    </Card>
  );
}