import type { Strategy, CandleData, BacktestResult, BacktestOptions } from "./types";
import { runBacktestEngine } from "../lib/backtest";

const candleEnergyStrategy: Strategy = {
  id: "candle-energy",
  name: "Candle Energy",
  description: "Measures bull/bear energy from candle body, close position, and wick rejection over a lookback window. Enters on strong confirmation candle with high body ratio. Cooldown between trades filters noise.",
  parameters: [
    { name: "lookback", label: "Lookback", default: 7, min: 3, max: 20, step: 1 },
    { name: "energyThreshold", label: "Energy Threshold", default: 3.5, min: 1.0, max: 10.0, step: 0.5 },
    { name: "bodyRatio", label: "Min Body Ratio", default: 0.65, min: 0.3, max: 0.95, step: 0.05 },
    { name: "cooldown", label: "Cooldown", default: 20, min: 1, max: 100, step: 1 },
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
        const upperReject = (c.high - Math.max(c.close, c.open)) / range;
        const lowerReject = (Math.min(c.close, c.open) - c.low) / range;

        if (c.close > c.open) {
          bullEnergy += body / range;
          bullEnergy += closePosition;
          bullEnergy -= upperReject;
        } else {
          bearEnergy += body / range;
          bearEnergy += 1 - closePosition;
          bearEnergy -= lowerReject;
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
