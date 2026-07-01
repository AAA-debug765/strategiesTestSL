import type { Strategy, CandleData, BacktestResult, BacktestOptions } from "./types";
import { bollingerBands } from "./helpers";
import { runBacktestEngine } from "../lib/backtest";

const bollingerStrategy: Strategy = {
  id: "bollinger",
  name: "Bollinger Bands",
  description: "Long when price crosses above middle band (SMA), short when price crosses below middle band.",
  parameters: [
    { name: "period", label: "BB Period", default: 20, min: 5, max: 50, step: 1 },
    { name: "stdMultiplier", label: "Std Dev Mult", default: 2.0, min: 0.5, max: 4.0, step: 0.1 },
  ],
  run(candles: CandleData[], params: Record<string, number>, options?: BacktestOptions): BacktestResult {
    const { period, stdMultiplier } = params;
    const { middle } = bollingerBands(candles, period, stdMultiplier);
    const signals: number[] = new Array(candles.length).fill(0);
    for (let i = 0; i < candles.length; i++) {
      if (isNaN(middle[i]) || i < 1) { signals[i] = 0; continue; }
      const prevMiddle = middle[i - 1];
      if (isNaN(prevMiddle)) { signals[i] = 0; continue; }

      // Cross above middle → long
      if (candles[i - 1].close <= prevMiddle && candles[i].close > middle[i]) { signals[i] = 1; continue; }
      // Cross below middle → short
      if (candles[i - 1].close >= prevMiddle && candles[i].close < middle[i]) { signals[i] = -1; continue; }

      // First valid signal: set initial direction
      if (signals[i - 1] === 0) {
        signals[i] = candles[i].close > middle[i] ? 1 : -1;
        continue;
      }
      signals[i] = signals[i - 1];
    }
    return runBacktestEngine(candles, signals, params, options);
  },
};
export default bollingerStrategy;
