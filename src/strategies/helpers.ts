import type { CandleData } from "./types";

export function sma(candles: CandleData[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    result.push(sum / period);
  }
  return result;
}

export function rsi(candles: CandleData[], period: number): number[] {
  const result: number[] = [];
  if (candles.length < period + 1) return candles.map(() => NaN);
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) gainSum += change; else lossSum += Math.abs(change);
  }
  const avgGain = gainSum / period;
  const avgLoss = lossSum / period;
  for (let i = 0; i < period; i++) result.push(NaN);
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  let prevAvgGain = avgGain, prevAvgLoss = avgLoss;
  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    const currentAvgGain = (prevAvgGain * (period - 1) + gain) / period;
    const currentAvgLoss = (prevAvgLoss * (period - 1) + loss) / period;
    prevAvgGain = currentAvgGain; prevAvgLoss = currentAvgLoss;
    result.push(currentAvgLoss === 0 ? 100 : 100 - 100 / (1 + currentAvgGain / currentAvgLoss));
  }
  return result;
}

export function bollingerBands(
  candles: CandleData[], period: number, stdMultiplier: number
): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = sma(candles, period);
  const upper: number[] = []; const lower: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (isNaN(middle[i])) { upper.push(NaN); lower.push(NaN); continue; }
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (candles[j].close - middle[i]) ** 2;
    const std = Math.sqrt(sumSq / period);
    upper.push(middle[i] + stdMultiplier * std);
    lower.push(middle[i] - stdMultiplier * std);
  }
  return { upper, middle, lower };
}