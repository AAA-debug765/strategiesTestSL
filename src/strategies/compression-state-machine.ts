import type { Strategy, CandleData, BacktestResult, BacktestOptions } from "./types";
import { runBacktestEngine } from "../lib/backtest";

const compressionStateMachine: Strategy = {
  id: "compression-state-machine-v2",
  name: "Compression State Machine V2",
  description: "Compression → ARMED → strong breakout candle → one signal → cooldown.",
  parameters: [
    { name: "compressionWindow", label: "Compression Window", default: 20, min: 5, max: 50, step: 1 },
    { name: "historyWindow", label: "History Window", default: 100, min: 30, max: 300, step: 10 },
    { name: "compressionFactor", label: "Compression Factor", default: 3.0, min: 1.0, max: 10, step: 0.5 },
    { name: "bodyRatioThreshold", label: "Body Ratio", default: 0.65, min: 0.3, max: 0.95, step: 0.05 },
    { name: "cooldown", label: "Cooldown", default: 20, min: 0, max: 100, step: 1 },
  ],
  run(candles: CandleData[], params: Record<string, number>, options?: BacktestOptions): BacktestResult {
    const { compressionWindow, historyWindow, compressionFactor, bodyRatioThreshold, cooldown: cooldownBars } = params;

    const signals = new Array(candles.length).fill(0);
    let state: "SEARCH" | "ARMED" = "SEARCH";
    let cooldown = 0;

    for (let i = historyWindow; i < candles.length; i++) {
      if (cooldown > 0) { cooldown--; continue; }

      let highest = -Infinity, lowest = Infinity;
      for (let j = i - compressionWindow; j < i; j++) {
        highest = Math.max(highest, candles[j].high);
        lowest = Math.min(lowest, candles[j].low);
      }
      const compressionRange = highest - lowest;

      let avgRange = 0;
      for (let j = i - historyWindow; j < i; j++) {
        avgRange += candles[j].high - candles[j].low;
      }
      avgRange /= historyWindow;

      const compressed = compressionRange < avgRange * compressionFactor;

      if (state === "SEARCH") {
        if (compressed) state = "ARMED";
        continue;
      }

      if (state === "ARMED") {
        const c = candles[i];
        const body = Math.abs(c.close - c.open);
        const range = c.high - c.low;
        const bodyRatio = range === 0 ? 0 : body / range;

        if (bodyRatio < bodyRatioThreshold) continue;

        if (c.close > highest && c.close > c.open) {
          signals[i] = 1; state = "SEARCH"; cooldown = cooldownBars; continue;
        }
        if (c.close < lowest && c.close < c.open) {
          signals[i] = -1; state = "SEARCH"; cooldown = cooldownBars; continue;
        }

        if (!compressed) state = "SEARCH";
      }
    }

    return runBacktestEngine(candles, signals, params, options);
  },
};

export default compressionStateMachine;