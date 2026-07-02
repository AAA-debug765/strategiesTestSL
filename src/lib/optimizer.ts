import type { Strategy, BacktestOptions, OptimizeResult, BacktestMetrics, OptimizeColumn } from "../strategies/types";
import { DEFAULT_OPTIMIZE_COLUMNS } from "../strategies/types";

// ── Types ──────────────────────────────────────────────

export interface OptJob {
  status: "running" | "done" | "error";
  current: number;
  total: number;
  startTime: number;
  results?: OptimizeResult[];
  error?: string;
  phase?: string;
}

export interface OptimizeRequest {
  strategyId: string;
  candles: import("../strategies/types").CandleData[];
  rangeOverrides?: Record<string, { min?: number; max?: number; step?: number }>;
  options?: BacktestOptions;
  funnel?: boolean;
}

export interface OptimizeResponse {
  jobId: string;
  columns?: OptimizeColumn[];
}

// ── Default scoring (used when strategy has no optimizeGoal) ──

const DEFAULT_SCORER = (m: BacktestMetrics): number => {
  if (m.totalTrades === 0) return Infinity;
  return m.maxConsecutiveSl / m.totalTrades;
};

// ── Streaming combo helpers (zero memory allocation) ──

interface ParamDef { name: string; values: number[] }

function comboFromIndices(params: ParamDef[], indices: number[]): Record<string, number> {
  const combo: Record<string, number> = {};
  for (let p = 0; p < params.length; p++) combo[params[p].name] = params[p].values[indices[p]];
  return combo;
}

function countCombos(params: ParamDef[]): number {
  let total = 1;
  for (const p of params) total *= p.values.length;
  return total;
}

function advanceIndices(indices: number[], lengths: number[]): boolean {
  for (let p = indices.length - 1; p >= 0; p--) {
    indices[p]++;
    if (indices[p] < lengths[p]) return true;
    indices[p] = 0;
  }
  return false;
}

// ── Build param value arrays from strategy + overrides ──

function buildParamValues(strategy: Strategy, rangeOverrides?: Record<string, { min?: number; max?: number; step?: number }>): ParamDef[] {
  return strategy.parameters.map((p) => {
    const override = rangeOverrides?.[p.name];
    const min = override?.min ?? p.min;
    const max = override?.max ?? p.max;
    const step = override?.step ?? p.step;
    const vals: number[] = [];
    const steps = Math.round((max - min) / step);
    for (let i = 0; i <= steps; i++) {
      vals.push(parseFloat((min + i * step).toFixed(10)));
    }
    return { name: p.name, values: vals };
  });
}

// ── Build ranges for fine scan ──

function buildRanges(strategy: Strategy, rangeOverrides?: Record<string, { min?: number; max?: number; step?: number }>) {
  return strategy.parameters.map((p) => {
    const override = rangeOverrides?.[p.name];
    return {
      name: p.name,
      min: override?.min ?? p.min,
      max: override?.max ?? p.max,
      step: override?.step ?? p.step,
    };
  });
}

// ── Score a result using strategy's optimizeGoal or default ──

function scoreResult(result: OptimizeResult, scorer: (m: BacktestMetrics) => number): OptimizeResult {
  const score = scorer(result.metrics);
  return {
    params: result.params,
    metrics: { ...result.metrics, score },
  };
}

// ── Sort by score (lower = better), 0-trade results last ──

function sortByScore(a: OptimizeResult, b: OptimizeResult): number {
  const aZero = a.metrics.totalTrades === 0 ? 1 : 0;
  const bZero = b.metrics.totalTrades === 0 ? 1 : 0;
  if (aZero !== bZero) return aZero - bZero;
  return a.metrics.score - b.metrics.score;
}

// ── Job store ──

const JOBS_KEY = "__optimizer_jobs__";

const jobStore = {
  _get(): Map<string, OptJob> {
    if (!(globalThis as any)[JOBS_KEY]) (globalThis as any)[JOBS_KEY] = new Map<string, OptJob>();
    return (globalThis as any)[JOBS_KEY];
  },
  get(id: string): OptJob | undefined { return this._get().get(id); },
  set(id: string, job: OptJob): void { this._get().set(id, job); },
  delete(id: string): void { this._get().delete(id); },
  cleanup(max = 10): void {
    const map = this._get();
    if (map.size <= max) return;
    const keys = [...map.keys()];
    for (let i = 0; i < keys.length - max; i++) map.delete(keys[i]);
  },
};

export function getOptJob(jobId: string): OptJob | undefined {
  return jobStore.get(jobId);
}

// ── Yield to event loop ──

const yieldTick = () => new Promise<void>((r) => setTimeout(r, 0));

// ── Main: start optimization ──

const BRUTE_FORCE_CAP = 500_000;

export function startOptimization(req: OptimizeRequest): OptimizeResponse {
  const { strategyId, candles, rangeOverrides, options, funnel = false } = req;

  const strategy = getStrategy(strategyId);
  if (!strategy) throw new Error(`Strategy "${strategyId}" not found`);
  if (!candles?.length) throw new Error("candles is required and must be non-empty");

  const paramValues = buildParamValues(strategy, rangeOverrides);
  const ranges = buildRanges(strategy, rangeOverrides);
  const totalPossible = countCombos(paramValues);
  const scorer = strategy.optimizeGoal ?? DEFAULT_SCORER;
  const optOptions = options ?? ({} as BacktestOptions);
  const nParams = paramValues.length;
  const useFunnel = funnel || totalPossible > BRUTE_FORCE_CAP;

  if (!funnel && totalPossible > BRUTE_FORCE_CAP) {
    console.log(`[optimizer] Auto-funnel: totalPossible=${totalPossible.toLocaleString()} > ${BRUTE_FORCE_CAP}`);
  }

  console.log(`[optimizer] strategy=${strategyId} candles=${candles.length} total=${totalPossible.toLocaleString()} funnel=${useFunnel}`);

  const jobId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job: OptJob = {
    status: "running",
    current: 0,
    total: 0,
    startTime: Date.now(),
    phase: useFunnel ? "Starting..." : undefined,
  };
  jobStore.cleanup();
  jobStore.set(jobId, job);

  if (useFunnel) {
    runFunnel(job, strategy, candles, paramValues, ranges, optOptions, scorer, nParams, totalPossible);
  } else {
    runBruteForce(job, strategy, candles, paramValues, optOptions, scorer, nParams, totalPossible);
  }

  return {
    jobId,
    columns: strategy.optimizeColumns,
  };
}

// ── Cancel optimization ──

export function cancelOptimization(jobId: string): OptimizeResult[] {
  const job = jobStore.get(jobId);
  if (!job) return [];
  if (job.status === "running") job.status = "done";
  return job.results ?? [];
}

// ── Brute force (streaming) ──

async function runBruteForce(
  job: OptJob,
  strategy: Strategy,
  candles: import("../strategies/types").CandleData[],
  paramValues: ParamDef[],
  options: BacktestOptions,
  scorer: (m: BacktestMetrics) => number,
  nParams: number,
  total: number,
) {
  job.total = total;
  const lengths = paramValues.map((p) => p.values.length);
  const results: OptimizeResult[] = [];
  let errors = 0;
  const indices = new Array(nParams).fill(0);

  for (let i = 0; i < total; i++) {
    try {
      const combo = comboFromIndices(paramValues, indices);
      const result = strategy.run(candles, combo, options);
      results.push(scoreResult({ params: result.params, metrics: result.metrics }, scorer));
    } catch (err) {
      errors++;
      if (errors <= 3) {
        const combo = comboFromIndices(paramValues, indices);
        console.error(`[optimizer] Error on combo ${i}:`, combo, err instanceof Error ? err.message : err);
      }
    }
    job.current = i + 1;
    if (i % 50 === 0 && i > 0) {
      results.sort(sortByScore);
      job.results = results.slice(0, 100);
    }
    if (job.status !== "running") break;
    advanceIndices(indices, lengths);
    if (i % 10 === 0) await yieldTick();
  }

  if (errors > 0) console.error(`[optimizer] Total errors: ${errors}/${total}`);
  results.sort(sortByScore);
  job.results = results.slice(0, 100);
  job.status = "done";
  job.current = total;
  console.log(`[optimizer] Brute done: ${results.length} results, ${results.filter(r => r.metrics.totalTrades > 0).length} with trades`);
}

// ── Funnel mode (streaming) ──

async function runFunnel(
  job: OptJob,
  strategy: Strategy,
  candles: import("../strategies/types").CandleData[],
  paramValues: ParamDef[],
  ranges: { name: string; min: number; max: number; step: number }[],
  options: BacktestOptions,
  scorer: (m: BacktestMetrics) => number,
  nParams: number,
  totalPossible: number,
) {
  const COARSE_TARGET = 5000;
  const TOP_N = 10;
  const FINE_RADIUS = 2;

  const stride = nParams > 0
    ? Math.max(1, Math.ceil(Math.pow(totalPossible / COARSE_TARGET, 1 / nParams)))
    : 1;

  // Coarse param defs
  const coarseParams: ParamDef[] = paramValues.map((pv) => {
    const coarse: number[] = [];
    for (let i = 0; i < pv.values.length; i += stride) coarse.push(pv.values[i]);
    if (coarse.length > 0 && coarse[coarse.length - 1] !== pv.values[pv.values.length - 1]) {
      coarse.push(pv.values[pv.values.length - 1]);
    }
    return { name: pv.name, values: coarse };
  });

  const coarseTotal = countCombos(coarseParams);
  const coarseLengths = coarseParams.map((p) => p.values.length);

  // ── PASS 1: Coarse ──
  job.phase = `Pass 1/2 — coarse (stride ${stride})`;
  job.total = coarseTotal;
  job.current = 0;

  const pass1Results: OptimizeResult[] = [];
  let errors = 0;
  const indices = new Array(nParams).fill(0);

  for (let i = 0; i < coarseTotal; i++) {
    try {
      const combo = comboFromIndices(coarseParams, indices);
      const result = strategy.run(candles, combo, options);
      pass1Results.push(scoreResult({ params: result.params, metrics: result.metrics }, scorer));
    } catch (err) {
      errors++;
    }
    job.current = i + 1;
    if (job.status !== "running") break;
    advanceIndices(indices, coarseLengths);
    if (i % 10 === 0) await yieldTick();
  }

  if (job.status !== "running") {
    pass1Results.sort(sortByScore);
    job.results = pass1Results.slice(0, 100);
    return;
  }

  pass1Results.sort(sortByScore);
  const topResults = pass1Results.filter(r => r.metrics.totalTrades > 0).slice(0, TOP_N);
  if (topResults.length === 0) {
    console.log(`[optimizer/funnel] No results with trades in pass 1`);
    job.results = pass1Results.slice(0, 100);
    job.status = "done";
    return;
  }

  // ── PASS 2: Fine ──
  const fineParamsList: ParamDef[][] = topResults.map((top) =>
    ranges.map((r) => {
      const center = top.params[r.name];
      const values: number[] = [];
      for (let d = -FINE_RADIUS; d <= FINE_RADIUS; d++) {
        const v = parseFloat((center + d * r.step).toFixed(10));
        if (v >= r.min && v <= r.max) values.push(v);
      }
      return { name: r.name, values };
    })
  );

  const fineTotals = fineParamsList.map((fp) => countCombos(fp));
  const fineGrandTotal = fineTotals.reduce((a, b) => a + b, 0);

  job.phase = "Pass 2/2 — fine";
  job.total = coarseTotal + fineGrandTotal;
  job.current = coarseTotal;

  const allResults = [...pass1Results];
  const seen = new Set<string>();

  for (let g = 0; g < fineParamsList.length; g++) {
    const fp = fineParamsList[g];
    const ft = fineTotals[g];
    const fLengths = fp.map((p) => p.values.length);
    const fIndices = new Array(nParams).fill(0);
    const baseOffset = coarseTotal + fineTotals.slice(0, g).reduce((a, b) => a + b, 0);

    for (let i = 0; i < ft; i++) {
      const combo = comboFromIndices(fp, fIndices);
      const key = Object.entries(combo).map(([k, v]) => `${k}=${v}`).join("|");
      if (!seen.has(key)) {
        seen.add(key);
        try {
          const result = strategy.run(candles, combo, options);
          allResults.push(scoreResult({ params: result.params, metrics: result.metrics }, scorer));
        } catch (err) {
          errors++;
        }
      }
      job.current = baseOffset + i + 1;
      if (job.status !== "running") break;
      advanceIndices(fIndices, fLengths);
      if (i % 10 === 0) await yieldTick();
    }
    if (job.status !== "running") break;
  }

  allResults.sort(sortByScore);
  job.results = allResults.slice(0, 100);
  job.status = "done";
  console.log(`[optimizer/funnel] Done: coarse=${coarseTotal}, fineGroups=${fineParamsList.length}, total=${allResults.length}, errors=${errors}, stride=${stride}`);
}

// ── Strategy resolver (decoupled) ──

let _strategyResolver: ((id: string) => Strategy | undefined) | null = null;

function getStrategy(id: string): Strategy | undefined {
  if (!_strategyResolver) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getStrategy: gs } = require("../strategies");
    _strategyResolver = gs;
  }
  return _strategyResolver(id);
}

export function setStrategyResolver(fn: (id: string) => Strategy | undefined) {
  _strategyResolver = fn;
}