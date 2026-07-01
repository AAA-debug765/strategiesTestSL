import type { Strategy, CandleData, BacktestResult, BacktestOptions } from "./types";
import { rsi } from "./helpers";
import { runBacktestEngine } from "../lib/backtest";

const stochRciStrategy: Strategy = {
  id: "stoch-rci",
  name: "Stochastic RCI",
  description: "Long when slow StochRSI exits lower zone upward, short when exits upper zone downward.",

  parameters: [
    { name: "rsiPeriod", label: "RSI Period", default: 14, min: 5, max: 50, step: 1 },
    { name: "stochPeriod", label: "Stoch Period", default: 14, min: 5, max: 50, step: 1 },
    { name: "smoothK", label: "Smooth K", default: 3, min: 1, max: 10, step: 1 },
    { name: "smoothD", label: "Smooth D", default: 3, min: 1, max: 10, step: 1 },
    { name: "lowerZone", label: "Lower Zone", default: 20, min: 5, max: 45, step: 1 },
    { name: "upperZone", label: "Upper Zone", default: 80, min: 55, max: 95, step: 1 },
  ],

  run(candles: CandleData[], params: Record<string, number>, options?: BacktestOptions): BacktestResult {
    const { rsiPeriod, stochPeriod, smoothK, smoothD, lowerZone, upperZone } = params;

    const signals: number[] = new Array(candles.length).fill(0);

    // Step 1: Calculate RSI
    const rsiValues = rsi(candles, rsiPeriod);

    // Step 2: Calculate raw StochRSI = (RSI - minRSI) / (maxRSI - minRSI) * 100
    const rawStoch: number[] = [];
    for (let i = 0; i < candles.length; i++) {
      if (isNaN(rsiValues[i]) || i < stochPeriod - 1) {
        rawStoch.push(NaN);
        continue;
      }

      let minRsi = Infinity, maxRsi = -Infinity;
      for (let j = i - stochPeriod + 1; j <= i; j++) {
        if (isNaN(rsiValues[j])) continue;
        minRsi = Math.min(minRsi, rsiValues[j]);
        maxRsi = Math.max(maxRsi, rsiValues[j]);
      }

      const range = maxRsi - minRsi;
      rawStoch.push(range === 0 ? 50 : ((rsiValues[i] - minRsi) / range) * 100);
    }

    // Step 3: Smooth raw StochRSI to get %K (fast)
    const kValues: number[] = [];
    for (let i = 0; i < candles.length; i++) {
      if (isNaN(rawStoch[i]) || i < smoothK - 1) {
        kValues.push(NaN);
        continue;
      }
      let sum = 0;
      for (let j = i - smoothK + 1; j <= i; j++) {
        if (!isNaN(rawStoch[j])) sum += rawStoch[j];
      }
      kValues.push(sum / smoothK);
    }

    // Step 4: Smooth %K to get %D (slow — signal line)
    const dValues: number[] = [];
    for (let i = 0; i < candles.length; i++) {
      if (isNaN(kValues[i]) || i < smoothD - 1) {
        dValues.push(NaN);
        continue;
      }
      let sum = 0;
      for (let j = i - smoothD + 1; j <= i; j++) {
        if (!isNaN(kValues[j])) sum += kValues[j];
      }
      dValues.push(sum / smoothD);
    }

    // Step 5: Generate signals based on %D crossovers out of zones
    for (let i = 1; i < candles.length; i++) {
      if (isNaN(dValues[i]) || isNaN(dValues[i - 1])) continue;

      const prev = dValues[i - 1];
      const curr = dValues[i];

      // Long: %D was in lower zone, now crossed above it
      if (prev <= lowerZone && curr > lowerZone) {
        signals[i] = 1;
      }
      // Short: %D was in upper zone, now crossed below it
      else if (prev >= upperZone && curr < upperZone) {
        signals[i] = -1;
      }
    }

    return runBacktestEngine(candles, signals, params, options);
  },
};

export default stochRciStrategy;