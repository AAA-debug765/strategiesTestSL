import type { Strategy, CandleData, BacktestResult, BacktestOptions } from "./types";
import { runBacktestEngine } from "../lib/backtest";

const candleEnergyStrategy: Strategy = {
  id: "candle-energy",
  name: "Candle Energy",
  description: "Measures bull/bear energy from candle body and close position over lookback. Enters on strong confirmation candle.",

  parameters: [
    { name: "lookback", label: "Lookback", default: 5, min: 3, max: 15, step: 1 },
    { name: "energyThreshold", label: "Energy Threshold", default: 1.5, min: 0.5, max: 5.0, step: 0.5 },
    { name: "bodyRatio", label: "Min Body Ratio", default: 0.5, min: 0.3, max: 0.9, step: 0.05 },
    { name: "cooldown", label: "Cooldown", default: 10, min: 1, max: 50, step: 1 },
  ],

  run(candles: CandleData[], params: Record<string, number>, options?: BacktestOptions): BacktestResult {
    const { lookback, energyThreshold, bodyRatio, cooldown } = params;

    const signals: number[] = new Array(candles.length).fill(0);
    let cd = 0;

    for (let i = lookback + 1; i < candles.length; i++) {
      if (cd > 0) { cd--; continue; }

      let bullEnergy = 0;
      let bearEnergy = 0;

      for (let j = i - lookback; j < i; j++) {
        const c = candles[j];
        const range = c.high - c.low;
        if (range <= 0) continue;

        const body = Math.abs(c.close - c.open);
        const closePosition = (c.close - c.low) / range;

        if (c.close > c.open) {
          bullEnergy += body / range + closePosition;
        } else {
          bearEnergy += body / range + (1 - closePosition);
        }
      }

      const diff = bullEnergy - bearEnergy;
      const last = candles[i];
      const lastRange = last.high - last.low;
      if (lastRange <= 0) continue;

      const br = Math.abs(last.close - last.open) / lastRange;

      // LONG
      if (diff > energyThreshold && last.close > last.open && br > bodyRatio) {
        signals[i] = 1;
        cd = Math.round(cooldown);
        continue;
      }

      // SHORT
      if (diff < -energyThreshold && last.close < last.open && br > bodyRatio) {
        signals[i] = -1;
        cd = Math.round(cooldown);
        continue;
      }
    }

    return runBacktestEngine(candles, signals, params, options);
  },
};

export default candleEnergyStrategy;