import type { Strategy, CandleData, BacktestResult, BacktestOptions } from "./types";
import { runBacktestEngine } from "../lib/backtest";

const maCrossStrategy: Strategy = {
  id: "ma-cross",
  name: "MA Crossover",
  description: "Goes long when fast MA crosses above slow MA, short when fast MA crosses below slow MA. Third (trend) MA filters direction: only long above it, only short below it.",
  parameters: [
    { name: "fastPeriod", label: "Fast MA Period", default: 10, min: 2, max: 50, step: 1 },
    { name: "slowPeriod", label: "Slow MA Period", default: 30, min: 5, max: 200, step: 1 },
    { name: "trendPeriod", label: "Trend MA Period", default: 100, min: 10, max: 500, step: 5 },
  ],
  run(candles: CandleData[], params: Record<string, number>, options?: BacktestOptions): BacktestResult {
    const { fastPeriod, slowPeriod, trendPeriod } = params;
    const fast: number[] = []; const slow: number[] = []; const trend: number[] = [];
    for (let i = 0; i < candles.length; i++) {
      if (i < fastPeriod - 1) fast.push(NaN);
      else { let sum = 0; for (let j = i - fastPeriod + 1; j <= i; j++) sum += candles[j].close; fast.push(sum / fastPeriod); }
      if (i < slowPeriod - 1) slow.push(NaN);
      else { let sum = 0; for (let j = i - slowPeriod + 1; j <= i; j++) sum += candles[j].close; slow.push(sum / slowPeriod); }
      if (i < trendPeriod - 1) trend.push(NaN);
      else { let sum = 0; for (let j = i - trendPeriod + 1; j <= i; j++) sum += candles[j].close; trend.push(sum / trendPeriod); }
    }
    const signals: number[] = new Array(candles.length).fill(0);
    for (let i = 0; i < candles.length; i++) {
      if (isNaN(fast[i]) || isNaN(slow[i]) || isNaN(trend[i])) { signals[i] = 0; continue; }

      // Trend filter: above trend → allow long only, below → allow short only
      const aboveTrend = fast[i] > trend[i] && slow[i] > trend[i];

      if (i === 0) {
        signals[i] = aboveTrend ? 1 : -1;
        continue;
      }
      if (isNaN(fast[i - 1]) || isNaN(slow[i - 1]) || isNaN(trend[i - 1])) {
        signals[i] = aboveTrend ? 1 : -1;
        continue;
      }

      const prevAboveTrend = fast[i - 1] > trend[i - 1] && slow[i - 1] > trend[i - 1];

      // Cross above middle → long (only if above trend)
      if (fast[i - 1] <= slow[i - 1] && fast[i] > slow[i] && aboveTrend) { signals[i] = 1; continue; }
      // Cross below middle → short (only if below trend)
      if (fast[i - 1] >= slow[i - 1] && fast[i] < slow[i] && !aboveTrend) { signals[i] = -1; continue; }

      // Trend changed → flip direction
      if (aboveTrend && !prevAboveTrend && signals[i - 1] === -1) { signals[i] = 1; continue; }
      if (!aboveTrend && prevAboveTrend && signals[i - 1] === 1) { signals[i] = -1; continue; }

      // If current position violates new trend → close
      if (signals[i - 1] === 1 && !aboveTrend) { signals[i] = 0; continue; }
      if (signals[i - 1] === -1 && aboveTrend) { signals[i] = 0; continue; }

      signals[i] = signals[i - 1];
    }
    return runBacktestEngine(candles, signals, params, options);
  },
};
export default maCrossStrategy;