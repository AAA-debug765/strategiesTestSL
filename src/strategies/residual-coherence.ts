import type { Strategy, CandleData, BacktestResult, BacktestOptions, BacktestMetrics } from "./types";
import { runBacktestEngine } from "../lib/backtest";

const residualCoherence: Strategy = {
  id: "residual-coherence-v1",
  name: "Residual Coherence V1",
  description: "Energy coherence model based purely on candle geometry.",

  parameters: [
    { name: "window", label: "Window", default: 30, min: 10, max: 80, step: 1 },
    { name: "coherenceThreshold", label: "Coherence Thr", default: 0.72, min: 0.3, max: 2, step: 0.01 },
    { name: "directionThreshold", label: "Direction Thr", default: 0.18, min: 0.05, max: 1, step: 0.01 },
    { name: "cooldown", label: "Cooldown", default: 15, min: 0, max: 100, step: 1 },
  ],

  optimizeGoal: (m: BacktestMetrics) => {
    if (m.totalTrades === 0) return Infinity;
    // Minimize SL streaks relative to trade count, penalize low trade count
    return (m.maxConsecutiveSl / m.totalTrades) + (1 / m.totalTrades);
  },

  optimizeColumns: [
    { key: "score", label: "Score" },
    { key: "totalTrades", label: "Trades" },
    { key: "winRate", label: "Win %", format: (v: number) => v.toFixed(1) },
    { key: "maxConsecutiveSl", label: "Max SL" },
    { key: "netPnl", label: "Net PnL", format: (v: number) => v.toFixed(0) },
    { key: "maxDrawdownPct", label: "DD %", format: (v: number) => v.toFixed(1) },
  ],

  run(candles: CandleData[], params: Record<string, number>, options?: BacktestOptions): BacktestResult {
    const { window, coherenceThreshold, directionThreshold, cooldown } = params;

    const signals: number[] = new Array(candles.length).fill(0);
    let cd = 0;

    for (let i = window + 2; i < candles.length; i++) {
      if (cd > 0) {
        cd--;
        continue;
      }

      let energySum = 0;
      let destruction = 0;
      let signedEnergy = 0;
      let previousEnergy = 0;

      for (let j = i - window; j < i; j++) {
        const c = candles[j];
        const range = Math.max(c.high - c.low, 1e-8);
        const body = Math.abs(c.close - c.open);
        const energy = (body * body) / range;

        energySum += energy;

        if (j > i - window) {
          destruction += Math.abs(energy - previousEnergy);
        }

        previousEnergy = energy;

        const dir = Math.sign(c.close - candles[j - 1].close);
        signedEnergy += energy * dir;
      }

      const coherence = Math.abs(signedEnergy) / (destruction + 1e-8);
      const directionalBias = signedEnergy / (energySum + 1e-8);

      if (coherence < coherenceThreshold) continue;
      if (Math.abs(directionalBias) < directionThreshold) continue;

      signals[i] = directionalBias > 0 ? 1 : -1;
      cd = cooldown;
    }

    return runBacktestEngine(candles, signals, params, options);
  },
};

export default residualCoherence;