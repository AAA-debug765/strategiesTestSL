"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import type {
  BacktestResult,
  OptimizeResult,
  BacktestOptions,
} from "@/strategies/types";

// ── localStorage keys ──────────────────────────────────

const LS_PARAMS_KEY = "backtester_saved_params";
const LS_RANGES_KEY = "backtester_saved_ranges";
const LS_STRATEGY_KEY = "backtester_saved_strategy";
const LS_FEE_KEY = "backtester_fee_settings";

// ── Fee Settings (TP/SL/Fee/Capital) ───────────────────

export interface FeeSettings {
  tpPrice: number;
  slPrice: number;
  feePct: number;
  initialCapital: number;
  tpStep: number;
  slStep: number;
  exitOnSignal: boolean;
}

const DEFAULT_FEE_SETTINGS: FeeSettings = {
  tpPrice: 0,
  slPrice: 0,
  feePct: 0.04,
  initialCapital: 10000,
  tpStep: 0.001,
  slStep: 0.001,
  exitOnSignal: true,
};

function loadFeeSettings(): FeeSettings {
  try {
    const raw = localStorage.getItem(LS_FEE_KEY);
    if (!raw) return { ...DEFAULT_FEE_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_FEE_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_FEE_SETTINGS };
  }
}

function saveFeeSettings(s: FeeSettings) {
  try {
    localStorage.setItem(LS_FEE_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

// ── Saved params ───────────────────────────────────────

function loadSavedParams(strategyId: string): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(LS_PARAMS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed[strategyId] ?? null;
  } catch {
    return null;
  }
}

function saveParams(strategyId: string, params: Record<string, number>) {
  try {
    const raw = localStorage.getItem(LS_PARAMS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[strategyId] = params;
    localStorage.setItem(LS_PARAMS_KEY, JSON.stringify(parsed));
  } catch { /* ignore */ }
}

function loadSavedRanges(strategyId: string): Record<string, { min: number; max: number; step: number }> | null {
  try {
    const raw = localStorage.getItem(LS_RANGES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed[strategyId] ?? null;
  } catch {
    return null;
  }
}

function saveRanges(strategyId: string, ranges: Record<string, { min: number; max: number; step: number }>) {
  try {
    const raw = localStorage.getItem(LS_RANGES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[strategyId] = ranges;
    localStorage.setItem(LS_RANGES_KEY, JSON.stringify(parsed));
  } catch { /* ignore */ }
}

function loadSavedStrategy(): string | null {
  try {
    return localStorage.getItem(LS_STRATEGY_KEY);
  } catch {
    return null;
  }
}

function saveSelectedStrategy(id: string) {
  try {
    localStorage.setItem(LS_STRATEGY_KEY, id);
  } catch { /* ignore */ }
}

// ── Convert FeeSettings → BacktestOptions ──────────────

export function feeSettingsToOptions(fs: FeeSettings): BacktestOptions {
  const opts: BacktestOptions = { initialCapital: fs.initialCapital, exitOnSignal: fs.exitOnSignal };
  if (fs.feePct > 0) opts.feePct = fs.feePct;
  if (fs.tpPrice > 0) opts.tpPrice = fs.tpPrice;
  if (fs.slPrice > 0) opts.slPrice = fs.slPrice;
  return opts;
}

// ── Strategy status ────────────────────────────────────

export interface StrategyStatus {
  id: string;
  name: string;
  description: string;
  parameters: { name: string; label: string; default: number; min: number; max: number; step: number }[];
  valid: boolean;
  error?: string;
}

interface StrategyContextType {
  allStrategies: StrategyStatus[];
  strategies: StrategyStatus[];
  selectedId: string;
  setSelectedId: (id: string) => void;
  selectedStrategy: StrategyStatus | undefined;
  paramValues: Record<string, number>;
  setParamValues: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  paramRanges: Record<string, { min: number; max: number; step: number }>;
  setParamRanges: React.Dispatch<React.SetStateAction<Record<string, { min: number; max: number; step: number }>>>;
  backtestResult: BacktestResult | null;
  isBacktesting: boolean;
  backtestError: string | null;
  setBacktestError: (e: string | null) => void;
  isOptimizing: boolean;
  optError: string | null;
  setOptError: (e: string | null) => void;
  optProgress: { current: number; total: number; startTime: number; phase?: string };
  optResults: OptimizeResult[];
  runBacktest: () => void;
  runOptimize: () => void;
  funnelMode: boolean;
  setFunnelMode: (v: boolean) => void;
  cancelOptimize: () => void;
  selectBestResult: (result: OptimizeResult) => void;
  saveAndApplyResult: (result: OptimizeResult) => void;
  highlightedTrade: number | null;
  setHighlightedTrade: (idx: number | null) => void;
  // Fee / TP/SL / Capital
  feeSettings: FeeSettings;
  setFeeSettings: React.Dispatch<React.SetStateAction<FeeSettings>>;
}

const StrategyContext = createContext<StrategyContextType | null>(null);

export function useStrategy() {
  const ctx = useContext(StrategyContext);
  if (!ctx) throw new Error("useStrategy must be used inside StrategyProvider");
  return ctx;
}

// ── Provider ───────────────────────────────────────────

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StrategyProviderProps {
  candles: Candle[];
  children: ReactNode;
}

export function StrategyProvider({ candles, children }: StrategyProviderProps) {
  const [allStrategies, setAllStrategies] = useState<StrategyStatus[]>([]);
  const strategies = allStrategies.filter((s) => s.valid);
  const [selectedId, setSelectedId] = useState("");
  const selectedStrategy = strategies.find((s) => s.id === selectedId);

  const [paramValues, setParamValues] = useState<Record<string, number>>({});
  const [paramRanges, setParamRanges] = useState<Record<string, { min: number; max: number; step: number }>>({});
  const [funnelMode, setFunnelMode] = useState(true);

  // Expose funnelMode to context

  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  const [optResults, setOptResults] = useState<OptimizeResult[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optProgress, setOptProgress] = useState({ current: 0, total: 0, startTime: 0, phase: undefined as string | undefined });
  const [optError, setOptError] = useState<string | null>(null);
  const abortOptRef = useRef<AbortController | null>(null);

  const [highlightedTrade, setHighlightedTrade] = useState<number | null>(null);

  // Fee settings (TP/SL/Fee/Capital) with localStorage
  const [feeSettings, setFeeSettingsState] = useState<FeeSettings>(DEFAULT_FEE_SETTINGS);
  const feeSettingsLoaded = useRef(false);

  useEffect(() => {
    const loaded = loadFeeSettings();
    setFeeSettingsState(loaded);
    feeSettingsLoaded.current = true;
  }, []);

  const setFeeSettings = useCallback((updater: React.SetStateAction<FeeSettings>) => {
    setFeeSettingsState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      // Persist to localStorage (only after initial load)
      if (feeSettingsLoaded.current) {
        saveFeeSettings(next);
      }
      return next;
    });
  }, []);

  // Build options for API
  const backtestOptions = feeSettingsToOptions(feeSettings);

  // Load strategies list with validation status
  useEffect(() => {
    fetch("/api/strategies")
      .then((r) => r.json())
      .then((data: StrategyStatus[]) => {
        setAllStrategies(data);
        const validData = data.filter((s) => s.valid);
        const saved = loadSavedStrategy();
        if (saved && validData.some((s) => s.id === saved)) {
          setSelectedId(saved);
        } else if (validData.length > 0) {
          setSelectedId(validData[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // When strategy changes, load params (saved or defaults)
  useEffect(() => {
    if (!selectedStrategy) return;
    const savedParams = loadSavedParams(selectedId);
    const savedRanges = loadSavedRanges(selectedId);
    const vals: Record<string, number> = {};
    const ranges: Record<string, { min: number; max: number; step: number }> = {};
    for (const p of selectedStrategy.parameters) {
      vals[p.name] = savedParams?.[p.name] ?? p.default;
      ranges[p.name] = savedRanges?.[p.name] ?? { min: p.min, max: p.max, step: p.step };
    }
    setParamValues(vals);
    setParamRanges(ranges);
    setBacktestResult(null);
    setBacktestError(null);
    setHighlightedTrade(null);
    setOptResults([]);
    setOptError(null);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save selected strategy to localStorage
  useEffect(() => {
    if (selectedId) saveSelectedStrategy(selectedId);
  }, [selectedId]);

  // Auto-save param ranges when changed
  useEffect(() => {
    if (selectedId && Object.keys(paramRanges).length > 0) {
      saveRanges(selectedId, paramRanges);
    }
  }, [paramRanges, selectedId]);

  // Clear backtest result when new data is loaded
  useEffect(() => {
    setBacktestResult(null);
    setBacktestError(null);
    setHighlightedTrade(null);
    setOptResults([]);
    setOptError(null);
  }, [candles]);

  const runBacktest = useCallback(async () => {
    if (!selectedId || candles.length === 0) return;
    setIsBacktesting(true);
    setBacktestError(null);
    setHighlightedTrade(null);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategyId: selectedId, candles, params: paramValues, options: backtestOptions }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }
      const data: BacktestResult = await res.json();
      setBacktestResult(data);
      setBacktestError(null);
    } catch (err) {
      setBacktestResult(null);
      setBacktestError(err instanceof Error ? err.message : "Backtest failed");
    } finally { setIsBacktesting(false); }
  }, [selectedId, candles, paramValues, backtestOptions]);

  const runOptimize = useCallback(async () => {
    if (!selectedId || candles.length === 0) return;
    if (abortOptRef.current) abortOptRef.current.abort();
    abortOptRef.current = new AbortController();
    setIsOptimizing(true);
    setOptResults([]);
    setOptProgress({ current: 0, total: 0, startTime: 0 });
    setOptError(null);
    try {
      // 1. Start optimization — server returns jobId immediately
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategyId: selectedId, candles, rangeOverrides: paramRanges, sortBy: "sharpeRatio", options: backtestOptions, funnel: funnelMode }),
        signal: abortOptRef.current.signal,
      });

      if (!res.ok) {
        let errorMsg = `Server error ${res.status}`;
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        } catch { /* ignore */ }
        throw new Error(errorMsg);
      }

      const { jobId } = await res.json();

      // 2. Poll for progress every 300ms
      const startTime = Date.now();
      setOptProgress({ current: 0, total: 0, startTime, phase: undefined });

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/optimize/status?jobId=${encodeURIComponent(jobId)}`);
          if (!statusRes.ok) return;
          const job = await statusRes.json();

          if (job.status === "running") {
            setOptProgress({
              current: job.current,
              total: job.total,
              startTime,
              phase: job.phase,
            });
          } else if (job.status === "done") {
            clearInterval(pollInterval);
            setOptProgress({
              current: job.total,
              total: job.total,
              startTime,
            });
            setOptResults(job.results ?? []);
            setIsOptimizing(false);
          } else if (job.status === "error") {
            clearInterval(pollInterval);
            setOptError(job.error || "Optimization failed");
            setIsOptimizing(false);
          }
        } catch { /* ignore poll errors, next interval will retry */ }
      }, 300);

      // Store refs so cancelOptimize can access them
      (abortOptRef.current as any)._pollInterval = pollInterval;
      (abortOptRef.current as any)._jobId = jobId;
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setOptError(err instanceof Error ? err.message : "Optimization failed");
      }
      setIsOptimizing(false);
    }
  }, [selectedId, candles, paramRanges, backtestOptions, funnelMode]);

  const cancelOptimize = useCallback(() => {
    const ctrl = abortOptRef.current;
    if (ctrl) {
      // Clear polling interval if it exists
      if ((ctrl as any)._pollInterval) {
        clearInterval((ctrl as any)._pollInterval);
      }
      ctrl.abort();
    }
    // Fetch partial results from server
    if ((ctrl as any)?._jobId) {
      fetch(`/api/optimize?jobId=${encodeURIComponent((ctrl as any)._jobId)}`, { method: "DELETE" })
        .then((r) => r.json())
        .then((data) => {
          if (data.results?.length > 0) {
            setOptResults(data.results);
          }
        })
        .catch(() => {});
    }
    setIsOptimizing(false);
    setOptError(null);
  }, []);

  const selectBestResult = useCallback((result: OptimizeResult) => {
    setBacktestResult(null);
    setBacktestError(null);
    fetch("/api/backtest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategyId: selectedId, candles, params: result.params, options: backtestOptions }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Server error");
        return r.json();
      })
      .then((data: BacktestResult) => { setBacktestResult(data); setParamValues(result.params); })
      .catch(() => {});
  }, [selectedId, candles, backtestOptions]);

  const saveAndApplyResult = useCallback((result: OptimizeResult) => {
    saveParams(selectedId, result.params);
    setParamValues(result.params);
    setBacktestResult(null);
    setBacktestError(null);
    fetch("/api/backtest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategyId: selectedId, candles, params: result.params, options: backtestOptions }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Server error");
        return r.json();
      })
      .then((data: BacktestResult) => { setBacktestResult(data); })
      .catch(() => {});
  }, [selectedId, candles, backtestOptions]);

  return (
    <StrategyContext.Provider value={{
      allStrategies, strategies, selectedId, setSelectedId, selectedStrategy,
      paramValues, setParamValues, paramRanges, setParamRanges,
      backtestResult, isBacktesting, backtestError,
      isOptimizing, optError, optProgress, optResults,
      runBacktest, runOptimize, cancelOptimize, selectBestResult,
      saveAndApplyResult,
      highlightedTrade, setHighlightedTrade,
      feeSettings, setFeeSettings, funnelMode, setFunnelMode,
      setBacktestError, setOptError,
    }}>
      {children}
    </StrategyContext.Provider>
  );
}