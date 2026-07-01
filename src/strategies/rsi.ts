import type { Strategy, CandleData, BacktestResult, BacktestOptions } from "./types";
import { rsi } from "./helpers";
import { runBacktestEngine } from "../lib/backtest";

const rsiStrategy: Strategy = {
  id: "rsi",
  name: "RSI Reversal",
  description: "Long when RSI crosses above oversold or midline (50), short when RSI crosses below overbought or midline.",
  parameters: [
    { name: "period", label: "RSI Period", default: 14, min: 2, max: 50, step: 1 },
    { name: "oversold", label: "Oversold Level", default: 30, min: 10, max: 45, step: 1 },
    { name: "overbought", label: "Overbought Level", default: 70, min: 55, max: 90, step: 1 },
  ],
  run(candles: CandleData[], params: Record<string, number>, options?: BacktestOptions): BacktestResult {
    const { period, oversold, overbought } = params;
    const rsiValues = rsi(candles, period);
    const signals: number[] = new Array(candles.length).fill(0);
    for (let i = 0; i < candles.length; i++) {
      if (isNaN(rsiValues[i]) || i < 1 || isNaN(rsiValues[i - 1])) { signals[i] = 0; continue; }

      // Crossover: RSI crosses above oversold → long
      if (rsiValues[i - 1] <= oversold && rsiValues[i] > oversold) { signals[i] = 1; continue; }
      // Crossover: RSI crosses below overbought → short
      if (rsiValues[i - 1] >= overbought && rsiValues[i] < overbought) { signals[i] = -1; continue; }
      // Crossover: RSI crosses above 50 → long
      if (rsiValues[i - 1] < 50 && rsiValues[i] >= 50) { signals[i] = 1; continue; }
      // Crossover: RSI crosses below 50 → short
      if (rsiValues[i - 1] > 50 && rsiValues[i] <= 50) { signals[i] = -1; continue; }

      // First valid signal: set initial direction based on RSI vs 50
      if (signals[i - 1] === 0) {
        signals[i] = rsiValues[i] >= 50 ? 1 : -1;
        continue;
      }
      signals[i] = signals[i - 1];
    }
    return runBacktestEngine(candles, signals, params, options);
  },
};
export default rsiStrategy;