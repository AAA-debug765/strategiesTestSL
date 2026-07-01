import type { Strategy, CandleData, BacktestResult, BacktestOptions } from "./types";
import { runBacktestEngine } from "../lib/backtest";

const geometryRelease: Strategy = {
  id: "geometry-release-v1",
  name: "Geometry Release",
  description: "Detects compression via low efficiency, then enters on strong breakout candle.",

  parameters: [
    { name: "window", label: "Window", default: 20, min: 5, max: 60, step: 1 },
    { name: "efficiencyThreshold", label: "Efficiency", default: 0.3, min: 0.05, max: 0.8, step: 0.05 },
    { name: "bodyFactor", label: "Body Factor", default: 1.3, min: 1.0, max: 3.0, step: 0.1 },
    { name: "cooldown", label: "Cooldown", default: 10, min: 0, max: 50, step: 1 },
  ],

  run(candles: CandleData[], params: Record<string, number>, options?: BacktestOptions): BacktestResult {
    const { window, efficiencyThreshold, bodyFactor, cooldown: cooldownBars } = params;

    const signals: number[] = new Array(candles.length).fill(0);
    let cd = 0;
    let avgBody = 0;

    for (let i = window + 1; i < candles.length; i++) {
      if (cd > 0) { cd--; continue; }

      // Calculate path and displacement over window
      let path = 0;
      let displacement = 0;
      let bodySum = 0;

      for (let j = i - window; j < i; j++) {
        const dx = candles[j].close - candles[j].open;
        path += Math.abs(dx);
        displacement += dx;
        bodySum += Math.abs(dx);
      }

      avgBody = bodySum / window;
      const efficiency = path === 0 ? 0 : Math.abs(displacement) / path;

      // Compression = low directional efficiency (choppy movement)
      const compressed = efficiency < efficiencyThreshold;

      if (!compressed) continue;

      // Check current candle: must be strong (body > avgBody * factor)
      const current = candles[i];
      const currentBody = Math.abs(current.close - current.open);

      if (currentBody < avgBody * bodyFactor) continue;

      // Direction from candle color
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

export default geometryRelease;