import type { Strategy, CandleData, BacktestResult, BacktestOptions } from "./types";
import { runBacktestEngine } from "../lib/backtest";

const alternateStrategy: Strategy = {
  id: "alternate",
  name: "MA Filter Reversal",
  description: "Long when price above MA, short when below MA. Always in position via signal-based re-entry.",

  parameters: [
    { name: "maPeriod", label: "MA Period", default: 50, min: 5, max: 500, step: 1 },
  ],

  run(candles: CandleData[], params: Record<string, number>, options?: BacktestOptions): BacktestResult {
    const { maPeriod } = params;

    const signals: number[] = new Array(candles.length).fill(0);

    for (let i = maPeriod; i < candles.length; i++) {
      // Calculate SMA
      let sum = 0;
      for (let j = i - maPeriod + 1; j <= i; j++) sum += candles[j].close;
      const sma = sum / maPeriod;

      if (candles[i].close >= sma) {
        signals[i] = 1; // long
      } else {
        signals[i] = -1; // short
      }
    }

    return runBacktestEngine(candles, signals, params, options);
  },
};

export default alternateStrategy;