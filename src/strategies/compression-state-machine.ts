import type { Strategy, CandleData, BacktestResult, BacktestOptions } from "./types";
import { runBacktestEngine } from "../lib/backtest";

const compressionStateMachine: Strategy = {
  id: "compression-state-machine-v2",
  name: "Compression State Machine V2",
  description: "Detects price compression (narrow range relative to history), enters on breakout candle.",

  parameters: [
    { name: "compressionWindow", label: "Compression Window", default: 10, min: 3, max: 30, step: 1 },
    { name: "historyWindow", label: "History Window", default: 50, min: 20, max: 200, step: 10 },
    { name: "compressionFactor", label: "Compression Factor", default: 0.5, min: 0.1, max: 1.0, step: 0.05 },
    { name: "bodyRatioThreshold", label: "Body Ratio", default: 0.5, min: 0.3, max: 0.9, step: 0.05 },
    { name: "cooldown", label: "Cooldown", default: 10, min: 0, max: 50, step: 1 },
  ],

  run(candles: CandleData[], params: Record<string, number>, options?: BacktestOptions): BacktestResult {
    const { compressionWindow, historyWindow, compressionFactor, bodyRatioThreshold, cooldown: cooldownBars } = params;

    const signals = new Array(candles.length).fill(0);
    let state: "SEARCH" | "ARMED" = "SEARCH";
    let cooldown = 0;

    for (let i = historyWindow; i < candles.length; i++) {
      if (cooldown > 0) { cooldown--; }

      // Calculate compression: current range vs average range
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
      } else if (state === "ARMED") {
        if (cooldown > 0) continue;

        const c = candles[i];
        const body = Math.abs(c.close - c.open);
        const range = c.high - c.low;
        const bodyRatio = range === 0 ? 0 : body / range;

        if (bodyRatio < bodyRatioThreshold) {
          // Not a strong candle — if no longer compressed, reset
          if (!compressed) state = "SEARCH";
          continue;
        }

        // Strong candle in armed state — enter
        if (c.close > c.open) {
          signals[i] = 1;
        } else {
          signals[i] = -1;
        }
        state = "SEARCH";
        cooldown = Math.round(cooldownBars);
      }
    }

    return runBacktestEngine(candles, signals, params, options);
  },
};

export default compressionStateMachine;