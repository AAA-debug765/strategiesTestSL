import { NextRequest } from "next/server";
import { getStrategy } from "@/strategies";
import type { OptimizeResult, BacktestOptions } from "@/strategies/types";

export const dynamic = "force-dynamic";

// ── Optimization goal: MINIMIZE maxConsecutiveSl (ascending sort) ──
// Every strategy returns BacktestMetrics.maxConsecutiveSl via runBacktestEngine.
// Future strategies must also return BacktestResult with this metric.

function sortByGoal(a: OptimizeResult, b: OptimizeResult): number {
  return a.metrics.maxConsecutiveSl - b.metrics.maxConsecutiveSl;
}

// ── Helper: generate cartesian product of param values ──
function generateCombos(paramVals: { name: string; values: number[] }[]): Record<string, number>[] {
  const combos: Record<string, number>[] = [];
  if (paramVals.length === 0) return combos;
  const lengths = paramVals.map((pv) => pv.values.length);
  const indices = new Array(paramVals.length).fill(0);
  outer:
  while (true) {
    const combo: Record<string, number> = {};
    for (let p = 0; p < paramVals.length; p++) {
      combo[paramVals[p].name] = paramVals[p].values[indices[p]];
    }
    combos.push(combo);
    for (let p = paramVals.length - 1; p >= 0; p--) {
      indices[p]++;
      if (indices[p] < lengths[p]) continue outer;
      indices[p] = 0;
    }
    break;
  }
  return combos;
}

// ── Global job store for polling-based progress ──────
// Use globalThis to share across Turbopack module instances

interface OptJob {
  status: "running" | "done" | "error";
  current: number;
  total: number;
  startTime: number;
  results?: OptimizeResult[];
  error?: string;
  phase?: string; // e.g. "Pass 1/2 — coarse" or "Pass 2/2 — fine"
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

// Cleanup old jobs (keep last 10)
function cleanupJobs() {
  const jobs = getJobsMap();
  if (jobs.size <= 10) return;
  const keys = [...jobs.keys()];
  for (let i = 0; i < keys.length - 10; i++) {
    jobs.delete(keys[i]);
  }
}

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

  // Build value arrays for each parameter (no cap)
  const paramValues: { name: string; values: number[] }[] = ranges.map((r) => {
    const vals: number[] = [];
    const steps = Math.round((r.max - r.min) / r.step);
    for (let i = 0; i <= steps; i++) {
      vals.push(parseFloat((r.min + i * r.step).toFixed(10)));
    }
    return { name: r.name, values: vals };
  });

  // Calculate total cartesian product size (for logging & stride calc)
  let totalPossible = 1;
  for (const pv of paramValues) totalPossible *= pv.values.length;
  console.log(`[optimize] strategy=${strategyId} candles=${candles.length} totalPossible=${totalPossible} goal=minimize maxConsecutiveSl funnel=${funnel}`);

  // Create job and return jobId immediately
  const jobId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job: OptJob = {
    status: "running",
    current: 0,
    total: 0,
    startTime: Date.now(),
    phase: funnel ? "Starting..." : undefined,
  };
  cleanupJobs();
  getJobsMap().set(jobId, job);

  // Run optimization in background (fire-and-forget)
  if (funnel) {
    // ═══════════════════════════════════════════════
    // ═══ FUNNEL MODE: 2-pass optimization ═══
    // ═══ Goal: minimize maxConsecutiveSl ═══
    // ═══════════════════════════════════════════════

    (async () => {
      const COARSE_TARGET = 5000;
      const TOP_N = 10;
      const FINE_RADIUS = 2;
      const YIELD_EVERY = 10;
      const yieldTick = () => new Promise<void>((r) => setTimeout(r, 0));

      // Calculate stride so coarse pass has ~COARSE_TARGET combos
      const nParams = paramValues.length;
      const stride = nParams > 0
        ? Math.max(1, Math.ceil(Math.pow(totalPossible / COARSE_TARGET, 1 / nParams)))
        : 1;

      // Build coarse value arrays (every stride-th value)
      const coarseParamValues = paramValues.map((pv) => {
        const coarse: number[] = [];
        for (let i = 0; i < pv.values.length; i += stride) {
          coarse.push(pv.values[i]);
        }
        // Always include last value if not already included
        if (coarse.length > 0 && coarse[coarse.length - 1] !== pv.values[pv.values.length - 1]) {
          coarse.push(pv.values[pv.values.length - 1]);
        }
        return { name: pv.name, values: coarse };
      });

      const coarseCombos = generateCombos(coarseParamValues);
      const coarseTotal = coarseCombos.length;

      // ── PASS 1: Coarse scan ──
      job.phase = "Pass 1/2 — coarse";
      job.total = coarseTotal;
      job.current = 0;

      const pass1Results: OptimizeResult[] = [];
      let errors = 0;

      for (let i = 0; i < coarseCombos.length; i++) {
        try {
          const result = strategy.run(candles, coarseCombos[i], options ?? ({} as BacktestOptions));
          pass1Results.push({ params: result.params, metrics: result.metrics });
        } catch (err) {
          errors++;
        }
        job.current = i + 1;
        if (job.status !== "running") break;
        if (i % YIELD_EVERY === 0) await yieldTick();
      }

      // If cancelled during pass 1, save partial and stop
      if (job.status !== "running") {
        pass1Results.sort(sortByGoal);
        job.results = pass1Results.slice(0, 100);
        return;
      }

      // Sort pass 1 by goal, pick top-N
      pass1Results.sort(sortByGoal);
      const topResults = pass1Results.slice(0, TOP_N);

      // ── Generate fine combos around top-N ──
      const fineCombos: Record<string, number>[] = [];
      for (const top of topResults) {
        const fineParamValues = ranges.map((r) => {
          const center = top.params[r.name];
          const values: number[] = [];
          for (let d = -FINE_RADIUS; d <= FINE_RADIUS; d++) {
            const v = parseFloat((center + d * r.step).toFixed(10));
            if (v >= r.min && v <= r.max) {
              values.push(v);
            }
          }
          return { name: r.name, values };
        });
        fineCombos.push(...generateCombos(fineParamValues));
      }

      // Deduplicate fine combos (top results may have close params)
      const seen = new Set<string>();
      const uniqueFineCombos = fineCombos.filter((c) => {
        const key = Object.entries(c).map(([k, v]) => `${k}=${v}`).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // ── PASS 2: Fine scan ──
      job.phase = "Pass 2/2 — fine";
      job.total = coarseTotal + uniqueFineCombos.length;
      job.current = coarseTotal;

      const allResults = [...pass1Results]; // include pass 1 results

      for (let i = 0; i < uniqueFineCombos.length; i++) {
        try {
          const result = strategy.run(candles, uniqueFineCombos[i], options ?? ({} as BacktestOptions));
          allResults.push({ params: result.params, metrics: result.metrics });
        } catch (err) {
          errors++;
        }
        job.current = coarseTotal + i + 1;
        if (job.status !== "running") break;
        if (i % YIELD_EVERY === 0) await yieldTick();
      }

      // Final sort by goal (minimize maxConsecutiveSl) and save
      allResults.sort(sortByGoal);
      job.results = allResults.slice(0, 100);
      job.status = "done";

      console.log(`[optimize/funnel] Done: pass1=${coarseTotal}, fine=${uniqueFineCombos.length}, total=${allResults.length}, errors=${errors}, stride=${stride}`);
    })();
  } else {
    // ═══════════════════════════════════════════════
    // ═══ BRUTE FORCE: full grid search ═══
    // ═══ Goal: minimize maxConsecutiveSl ═══
    // ═══════════════════════════════════════════════

    const combos = generateCombos(paramValues);
    const total = combos.length;
    job.total = total;

    (async () => {
      const results: OptimizeResult[] = [];
      let errors = 0;

      const YIELD_EVERY = 10;
      const yieldTick = () => new Promise<void>((r) => setTimeout(r, 0));

      for (let i = 0; i < combos.length; i++) {
        try {
          const result = strategy.run(candles, combos[i], options ?? ({} as BacktestOptions));
          results.push({ params: result.params, metrics: result.metrics });
        } catch (err) {
          errors++;
          if (errors <= 3) {
            console.error(`[optimize] Error on combo ${i}:`, combos[i], err instanceof Error ? err.message : err);
          }
        }

        job.current = i + 1;

        // Periodically sort and save partial results
        if (i % 50 === 0 && i > 0) {
          results.sort(sortByGoal);
          job.results = results.slice(0, 100);
        }

        if (job.status !== "running") break;
        if (i % YIELD_EVERY === 0) await yieldTick();
      }

      if (errors > 0) {
        console.error(`[optimize] Total errors: ${errors}/${total}`);
      }

      // Final sort by goal and save top 100
      results.sort(sortByGoal);
      job.results = results.slice(0, 100);

      job.status = "done";
      job.current = total;
      console.log(`[optimize] Completed: ${results.length} results, ${results.filter(r => r.metrics.totalTrades > 0).length} with trades`);
    })();
  }

  // Return jobId immediately — client will poll for progress
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
    job.status = "done"; // mark as done so polling stops
    // results are already populated by the running loop (partial)
  }

  return new Response(JSON.stringify({ ok: true, results: job.results ?? [] }), {
    headers: { "Content-Type": "application/json" },
  });
}