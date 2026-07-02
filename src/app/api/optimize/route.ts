import { NextRequest } from "next/server";
import { getStrategy } from "@/strategies";
import type { OptimizeResult, BacktestOptions } from "@/strategies/types";

export const dynamic = "force-dynamic";

// ── Optimization goal: MINIMIZE maxConsecutiveSl (ascending sort) ──

function sortByGoal(a: OptimizeResult, b: OptimizeResult): number {
  // Always prefer results with trades over 0-trade results
  const aTrades = a.metrics.totalTrades > 0 ? 0 : 1;
  const bTrades = b.metrics.totalTrades > 0 ? 0 : 1;
  if (aTrades !== bTrades) return aTrades - bTrades;
  return a.metrics.maxConsecutiveSl - b.metrics.maxConsecutiveSl;
}

// ── Streaming combo helpers (no memory allocation) ──

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

// ── Global job store for polling-based progress ──────

interface OptJob {
  status: "running" | "done" | "error";
  current: number;
  total: number;
  startTime: number;
  results?: OptimizeResult[];
  error?: string;
  phase?: string;
}

const OPT_JOBS_KEY = "__backtester_opt_jobs__";

function getJobsMap(): Map<string, OptJob> {
  if (!(globalThis as any)[OPT_JOBS_KEY]) {
    (globalThis as any)[OPT_JOBS_KEY] = new Map<string, OptJob>();
  }
  return (globalThis as any)[OPT_JOBS_KEY];
}

export function getOptJob(jobId: string): OptJob | undefined {
  return getJobsMap().get(jobId);
}

function cleanupJobs() {
  const jobs = getJobsMap();
  if (jobs.size <= 10) return;
  const keys = [...jobs.keys()];
  for (let i = 0; i < keys.length - 10; i++) jobs.delete(keys[i]);
}

const yieldTick = () => new Promise<void>((r) => setTimeout(r, 0));

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const { strategyId, candles, rangeOverrides, options, funnel = false } = body;

  if (!strategyId) {
    return new Response(JSON.stringify({ error: "strategyId is required" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  if (!candles || !Array.isArray(candles) || candles.length === 0) {
    return new Response(JSON.stringify({ error: `candles is required and must be non-empty (got ${candles?.length ?? 0})` }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const strategy = getStrategy(strategyId);
  if (!strategy) {
    return new Response(JSON.stringify({ error: `Strategy "${strategyId}" not found` }), {
      status: 404, headers: { "Content-Type": "application/json" },
    });
  }

  // Build param ranges
  const ranges: { name: string; min: number; max: number; step: number }[] = [];
  for (const p of strategy.parameters) {
    const override = rangeOverrides?.[p.name];
    ranges.push({
      name: p.name,
      min: override?.min ?? p.min,
      max: override?.max ?? p.max,
      step: override?.step ?? p.step,
    });
  }

  // Build value arrays
  const paramValues: ParamDef[] = ranges.map((r) => {
    const vals: number[] = [];
    const steps = Math.round((r.max - r.min) / r.step);
    for (let i = 0; i <= steps; i++) {
      vals.push(parseFloat((r.min + i * r.step).toFixed(10)));
    }
    return { name: r.name, values: vals };
  });

  const totalPossible = countCombos(paramValues);
  const nParams = paramValues.length;
  const optOptions = options ?? ({} as BacktestOptions);

  console.log(`[optimize] strategy=${strategyId} candles=${candles.length} totalPossible=${totalPossible.toLocaleString()} funnel=${funnel}`);

  // Auto-force funnel if brute force space is too large
  const BRUTE_FORCE_CAP = 500_000;
  const useFunnel = funnel || totalPossible > BRUTE_FORCE_CAP;

  if (!funnel && totalPossible > BRUTE_FORCE_CAP) {
    console.log(`[optimize] Auto-switching to funnel mode (totalPossible=${totalPossible.toLocaleString()} > ${BRUTE_FORCE_CAP})`);
  }

  // Create job
  const jobId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job: OptJob = {
    status: "running",
    current: 0,
    total: 0,
    startTime: Date.now(),
    phase: useFunnel ? "Starting..." : undefined,
  };
  cleanupJobs();
  getJobsMap().set(jobId, job);

  if (useFunnel) {
    // ═══════════════════════════════════════════════
    // ═══ FUNNEL MODE: 2-pass streaming ═══
    // ═══════════════════════════════════════════════

    (async () => {
      const COARSE_TARGET = 5000;
      const TOP_N = 10;
      const FINE_RADIUS = 2;

      // Calculate stride for coarse pass
      const stride = nParams > 0
        ? Math.max(1, Math.ceil(Math.pow(totalPossible / COARSE_TARGET, 1 / nParams)))
        : 1;

      // Build coarse param defs (every stride-th value) — streaming
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

      // ── PASS 1: Coarse scan (streaming) ──
      job.phase = `Pass 1/2 — coarse (stride ${stride})`;
      job.total = coarseTotal;
      job.current = 0;

      const pass1Results: OptimizeResult[] = [];
      let errors = 0;
      const indices = new Array(nParams).fill(0);

      for (let i = 0; i < coarseTotal; i++) {
        try {
          const combo = comboFromIndices(coarseParams, indices);
          const result = strategy.run(candles, combo, optOptions);
          pass1Results.push({ params: result.params, metrics: result.metrics });
        } catch (err) {
          errors++;
        }
        job.current = i + 1;
        if (job.status !== "running") break;
        advanceIndices(indices, coarseLengths);
        if (i % 10 === 0) await yieldTick();
      }

      if (job.status !== "running") {
        pass1Results.sort(sortByGoal);
        job.results = pass1Results.slice(0, 100);
        return;
      }

      // Pick top-N
      pass1Results.sort(sortByGoal);
      const topResults = pass1Results.filter(r => r.metrics.totalTrades > 0).slice(0, TOP_N);
      if (topResults.length === 0) {
        console.log(`[optimize/funnel] No results with trades in pass 1`);
        job.results = pass1Results.slice(0, 100);
        job.status = "done";
        return;
      }

      // ── PASS 2: Fine scan around top-N (streaming) ──
      const fineParams: ParamDef[][] = topResults.map((top) =>
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

      const fineTotals = fineParams.map((fp) => countCombos(fp));
      const fineGrandTotal = fineTotals.reduce((a, b) => a + b, 0);

      job.phase = "Pass 2/2 — fine";
      job.total = coarseTotal + fineGrandTotal;
      job.current = coarseTotal;

      const allResults = [...pass1Results];
      const seen = new Set<string>();

      for (let g = 0; g < fineParams.length; g++) {
        const fp = fineParams[g];
        const ft = fineTotals[g];
        const fLengths = fp.map((p) => p.values.length);
        const fIndices = new Array(nParams).fill(0);

        for (let i = 0; i < ft; i++) {
          const combo = comboFromIndices(fp, fIndices);
          const key = Object.entries(combo).map(([k, v]) => `${k}=${v}`).join("|");
          if (!seen.has(key)) {
            seen.add(key);
            try {
              const result = strategy.run(candles, combo, optOptions);
              allResults.push({ params: result.params, metrics: result.metrics });
            } catch (err) {
              errors++;
            }
          }
          job.current = coarseTotal + fineTotals.slice(0, g).reduce((a, b) => a + b, 0) + i + 1;
          if (job.status !== "running") break;
          advanceIndices(fIndices, fLengths);
          if (i % 10 === 0) await yieldTick();
        }
        if (job.status !== "running") break;
      }

      allResults.sort(sortByGoal);
      job.results = allResults.slice(0, 100);
      job.status = "done";
      console.log(`[optimize/funnel] Done: coarse=${coarseTotal}, fineGroups=${fineParams.length}, total=${allResults.length}, errors=${errors}, stride=${stride}`);
    })();
  } else {
    // ═══════════════════════════════════════════════
    // ═══ BRUTE FORCE: streaming grid search ═══
    // ═══════════════════════════════════════════════

    const total = totalPossible;
    job.total = total;

    const lengths = paramValues.map((p) => p.values.length);

    (async () => {
      const results: OptimizeResult[] = [];
      let errors = 0;
      const indices = new Array(nParams).fill(0);

      for (let i = 0; i < total; i++) {
        try {
          const combo = comboFromIndices(paramValues, indices);
          const result = strategy.run(candles, combo, optOptions);
          results.push({ params: result.params, metrics: result.metrics });
        } catch (err) {
          errors++;
          if (errors <= 3) {
            const combo = comboFromIndices(paramValues, indices);
            console.error(`[optimize] Error on combo ${i}:`, combo, err instanceof Error ? err.message : err);
          }
        }

        job.current = i + 1;

        if (i % 50 === 0 && i > 0) {
          results.sort(sortByGoal);
          job.results = results.slice(0, 100);
        }

        if (job.status !== "running") break;
        advanceIndices(indices, lengths);
        if (i % 10 === 0) await yieldTick();
      }

      if (errors > 0) console.error(`[optimize] Total errors: ${errors}/${total}`);

      results.sort(sortByGoal);
      job.results = results.slice(0, 100);
      job.status = "done";
      job.current = total;
      console.log(`[optimize] Completed: ${results.length} results, ${results.filter(r => r.metrics.totalTrades > 0).length} with trades`);
    })();
  }

  return new Response(JSON.stringify({ jobId }), {
    headers: { "Content-Type": "application/json" },
  });
}

// ── Abort endpoint: stop job and return partial results ──
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  if (!jobId) {
    return new Response(JSON.stringify({ error: "jobId is required" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const job = getOptJob(jobId);
  if (!job) {
    return new Response(JSON.stringify({ error: "Job not found" }), {
      status: 404, headers: { "Content-Type": "application/json" },
    });
  }

  if (job.status === "running") {
    job.status = "done";
  }

  return new Response(JSON.stringify({ ok: true, results: job.results ?? [] }), {
    headers: { "Content-Type": "application/json" },
  });
}