import type { Strategy, CandleData, BacktestResult, BacktestOptions } from "./types";
import { runBacktestEngine } from "../lib/backtest";

const grammarStrategy: Strategy = {
  id: "grammar-language-v1",
  name: "Grammar Language V1",
  description: "Treats candles as a language and trades repeated phrases.",

  parameters: [
    { name: "history", label: "History", default: 400, min: 100, max: 3000, step: 100 },
    { name: "phraseLength", label: "Phrase Length", default: 6, min: 3, max: 12, step: 1 },
    { name: "minMatches", label: "Min Matches", default: 8, min: 2, max: 50, step: 1 },
    { name: "confidence", label: "Confidence", default: 0.7, min: 0.5, max: 0.95, step: 0.01 },
    { name: "bodyThreshold", label: "Body Thr", default: 0.55, min: 0.2, max: 0.9, step: 0.05 },
    { name: "cooldown", label: "Cooldown", default: 20, min: 0, max: 100, step: 1 },
  ],

  run(candles: CandleData[], params: Record<string, number>, options?: BacktestOptions): BacktestResult {
    const { history, phraseLength, minMatches, confidence, bodyThreshold, cooldown } = params;

    const signals: number[] = new Array(candles.length).fill(0);

    // Encode candles into alphabet: U/u = bullish big/small, D/d = bearish big/small
    const alphabet: string[] = [];
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const range = Math.max(c.high - c.low, 1e-8);
      const body = Math.abs(c.close - c.open);
      const ratio = body / range;

      if (c.close >= c.open) {
        alphabet.push(ratio > bodyThreshold ? "U" : "u");
      } else {
        alphabet.push(ratio > bodyThreshold ? "D" : "d");
      }
    }

    let cd = 0;

    for (let i = history + phraseLength; i < candles.length - 1; i++) {
      if (cd > 0) {
        cd--;
        continue;
      }

      const phrase = alphabet.slice(i - phraseLength, i).join("");

      let bullish = 0;
      let bearish = 0;
      let matches = 0;

      for (let j = phraseLength; j < i - phraseLength; j++) {
        const p = alphabet.slice(j - phraseLength, j).join("");
        if (p !== phrase) continue;

        matches++;
        if (candles[j].close > candles[j].open) bullish++;
        else bearish++;
      }

      if (matches < minMatches) continue;

      const bullProb = bullish / matches;
      const bearProb = bearish / matches;

      if (bullProb >= confidence) {
        signals[i] = 1;
        cd = cooldown;
      } else if (bearProb >= confidence) {
        signals[i] = -1;
        cd = cooldown;
      }
    }

    return runBacktestEngine(candles, signals, params, options);
  },
};

export default grammarStrategy;