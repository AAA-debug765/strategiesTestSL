import type { Strategy, CandleData, BacktestResult, BacktestOptions } from "./types";
import { runBacktestEngine } from "../lib/backtest";

const memoryHoleStrategy: Strategy = {
  id: "memory-hole-v1",
  name: "Price Memory Hole",
  description: "Detects candles that break the local linear pattern (high model error), enters on strong confirmation.",

  parameters: [
    { name: "window", label: "Window", default: 15, min: 5, max: 50, step: 1 },
    { name: "errorThreshold", label: "Error Threshold", default: 0.002, min: 0.0005, max: 0.01, step: 0.0005 },
    { name: "bodyFactor", label: "Body Factor", default: 1.5, min: 1.0, max: 4.0, step: 0.1 },
    { name: "cooldown", label: "Cooldown", default: 10, min: 0, max: 50, step: 1 },
  ],

  run(candles: CandleData[], params: Record<string, number>, options?: BacktestOptions): BacktestResult {
    const { window, errorThreshold, bodyFactor, cooldown: cooldownBars } = params;

    const signals: number[] = new Array(candles.length).fill(0);
    let cd = 0;

    // Pre-compute model errors for each position in the window
    for (let i = window + 1; i < candles.length; i++) {
      if (cd > 0) { cd--; continue; }

      // Linear regression error over window [i-window, i)
      let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
      const n = window;
      for (let j = 0; j < n; j++) {
        const x = j;
        const y = candles[i - window + j].close;
        sumX += x; sumY += y; sumXX += x * x; sumXY += x * y;
      }
      const denom = n * sumXX - sumX * sumX;
      if (denom === 0) continue;
      const b = (n * sumXY - sumX * sumY) / denom;
      const a = (sumY - b * sumX) / n;

      // Check if previous candle (i-1) breaks the pattern significantly
      const prevIdx = i - 1;
      const predPrev = a + b * (window - 1);
      const actualPrev = candles[prevIdx].close;
      const prevError = Math.abs(actualPrev - predPrev);

      // Normalized error (relative to price level)
      const normError = actualPrev > 0 ? prevError / actualPrev : 0;

      // If previous candle breaks pattern significantly, check current for confirmation
      if (normError < errorThreshold) continue;

      const current = candles[i];
      const currentBody = Math.abs(current.close - current.open);
      const avgBody = Math.abs(candles[prevIdx].close - candles[prevIdx].open);

      if (currentBody < avgBody * bodyFactor) continue;

      if (current.close > current.open) {
        signals[i] = 1;
      } else {
        signals[i] = -1;
      }
      cd = Math.round(cooldownBars);
    }

    return runBacktestEngine(candles, signals, params, options);
  },
};

export default memoryHoleStrategy;