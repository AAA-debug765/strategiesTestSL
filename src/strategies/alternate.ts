import type { Strategy, CandleData, BacktestResult, BacktestOptions, Trade, BacktestMetrics } from "./types";

const DEFAULT_INITIAL_CAPITAL = 10000;

const alternateStrategy: Strategy = {
  id: "alternate",
  name: "MA Filter Reversal",
  description: "After each TP/SL close, opens long if price is above MA, short if below MA. Always in position, direction determined by trend filter.",
  parameters: [
    { name: "maPeriod", label: "MA Period", default: 50, min: 5, max: 500, step: 1 },
  ],
  run(candles: CandleData[], params: Record<string, number>, options?: BacktestOptions): BacktestResult {
    const { maPeriod } = params;
    const initialCapital = options?.initialCapital ?? DEFAULT_INITIAL_CAPITAL;
    const feePct = options?.feePct ?? 0;
    const tpPct = options?.tpPct ?? 0;
    const slPct = options?.slPct ?? 0;
    const tpUsdt = options?.tpUsdt ?? 0;
    const slUsdt = options?.slUsdt ?? 0;
    const tpPriceDist = options?.tpPrice ?? 0;
    const slPriceDist = options?.slPrice ?? 0;

    // Pre-calculate SMA
    const sma: number[] = [];
    for (let i = 0; i < candles.length; i++) {
      if (i < maPeriod - 1) { sma.push(NaN); continue; }
      let sum = 0;
      for (let j = i - maPeriod + 1; j <= i; j++) sum += candles[j].close;
      sma.push(sum / maPeriod);
    }

    function getTpPrice(price: number, entryType: "long" | "short"): number {
      if (tpPct > 0) return entryType === "long" ? price * (1 + tpPct / 100) : price * (1 - tpPct / 100);
      if (tpUsdt > 0 && initialCapital > 0) { const units = initialCapital / price; return entryType === "long" ? price + tpUsdt / units : price - tpUsdt / units; }
      if (tpPriceDist > 0) return entryType === "long" ? price + tpPriceDist : price - tpPriceDist;
      return Infinity;
    }
    function getSlPrice(price: number, entryType: "long" | "short"): number {
      if (slPct > 0) return entryType === "long" ? price * (1 - slPct / 100) : price * (1 + slPct / 100);
      if (slUsdt > 0 && initialCapital > 0) { const units = initialCapital / price; return entryType === "long" ? price - slUsdt / units : price + slUsdt / units; }
      if (slPriceDist > 0) return entryType === "long" ? price - slPriceDist : price + slPriceDist;
      return 0;
    }

    let equity = initialCapital;
    let position = 0;
    let entryPrice = 0;
    let entryTime = 0;
    let entryType: "long" | "short" = "long";
    let entryEquity = 0;
    const trades: Trade[] = [];
    const equityCurve: { time: number; value: number }[] = [];

    function closeTrade(exitPrice: number, exitTime: number, reason: "tp" | "sl" | "eod") {
      const closeValue = equity + position * (exitPrice - entryPrice);
      const exitFee = closeValue * feePct / 100;
      const entFee = entryEquity * feePct / 100;
      const pnl = closeValue - entryEquity - entFee - exitFee;
      const pnlPct = entryEquity > 0 ? (pnl / entryEquity) * 100 : 0;
      trades.push({ type: entryType, entryTime, entryPrice, exitTime, exitPrice, pnl, pnlPct, fee: entFee + exitFee, exitReason: reason });
      equity = closeValue - exitFee - entFee;
      position = 0;
    }

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      let currentEquity = equity;
      if (position !== 0) currentEquity = equity + position * (candle.close - entryPrice);
      equityCurve.push({ time: candle.time, value: currentEquity });

      if (position !== 0) {
        const tpPrice = getTpPrice(entryPrice, entryType);
        const slPrice = getSlPrice(entryPrice, entryType);
        let triggered: "tp" | "sl" | null = null;
        let triggerPrice = entryPrice;
        const bullish = candle.close >= candle.open;

        if (entryType === "long") {
          if (slPrice > 0 && candle.open <= slPrice) { triggered = "sl"; triggerPrice = slPrice; }
          else if (tpPrice < Infinity && candle.open >= tpPrice) { triggered = "tp"; triggerPrice = tpPrice; }
          else if (bullish) {
            if (tpPrice < Infinity && candle.high >= tpPrice) { triggered = "tp"; triggerPrice = tpPrice; }
            else if (slPrice > 0 && candle.low <= slPrice) { triggered = "sl"; triggerPrice = slPrice; }
          } else {
            if (slPrice > 0 && candle.low <= slPrice) { triggered = "sl"; triggerPrice = slPrice; }
            else if (tpPrice < Infinity && candle.high >= tpPrice) { triggered = "tp"; triggerPrice = tpPrice; }
          }
        } else {
          if (slPrice > 0 && candle.open >= slPrice) { triggered = "sl"; triggerPrice = slPrice; }
          else if (tpPrice < Infinity && candle.open <= tpPrice) { triggered = "tp"; triggerPrice = tpPrice; }
          else if (bullish) {
            if (slPrice > 0 && candle.high >= slPrice) { triggered = "sl"; triggerPrice = slPrice; }
            else if (tpPrice < Infinity && candle.low <= tpPrice) { triggered = "tp"; triggerPrice = tpPrice; }
          } else {
            if (tpPrice < Infinity && candle.low <= tpPrice) { triggered = "tp"; triggerPrice = tpPrice; }
            else if (slPrice > 0 && candle.high >= slPrice) { triggered = "sl"; triggerPrice = slPrice; }
          }
        }

        if (triggered) {
          closeTrade(triggerPrice, candle.time, triggered);
          continue;
        }
      } else {
        // Determine direction by MA: above → long, below → short
        if (isNaN(sma[i])) continue;
        const dir = candle.close >= sma[i] ? "long" : "short";
        entryEquity = equity;
        entryType = dir;
        entryPrice = candle.close;
        entryTime = candle.time;
        position = dir === "long" ? equity / candle.close : -(equity / candle.close);
      }
    }

    if (position !== 0 && candles.length > 0) {
      const last = candles[candles.length - 1];
      closeTrade(last.close, last.time, "eod");
      if (equityCurve.length > 0) equityCurve[equityCurve.length - 1].value = equity;
    }

    return { trades, equityCurve, metrics: calculateMetrics(trades, equityCurve, initialCapital), params };
  },
};

function calculateMetrics(trades: Trade[], equityCurve: { time: number; value: number }[], initialCapital: number): BacktestMetrics {
  const totalReturnPct = equityCurve.length > 0 ? ((equityCurve[equityCurve.length - 1].value - initialCapital) / initialCapital) * 100 : 0;
  let maxDrawdownPct = 0; let peak = initialCapital;
  for (const point of equityCurve) { if (point.value > peak) peak = point.value; const dd = ((peak - point.value) / peak) * 100; if (dd > maxDrawdownPct) maxDrawdownPct = dd; }
  const wins = trades.filter((t) => t.pnl > 0);
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossLoss = losses.reduce((s, t) => s + Math.abs(t.pnl), 0);
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999.99 : 0;
  const avgWinPct = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0;
  const avgLossPct = losses.length > 0 ? losses.reduce((s, t) => s + Math.abs(t.pnlPct), 0) / losses.length : 0;
  let sharpeRatio = 0;
  if (equityCurve.length > 1) {
    const returns: number[] = [];
    for (let i = 1; i < equityCurve.length; i++) { if (equityCurve[i - 1].value > 0) returns.push((equityCurve[i].value - equityCurve[i - 1].value) / equityCurve[i - 1].value); }
    if (returns.length > 1) {
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
      const stdDev = Math.sqrt(variance);
      sharpeRatio = stdDev > 0 ? (mean / stdDev) * Math.sqrt(8760) : 0;
    }
  }
  return { totalReturnPct, maxDrawdownPct, sharpeRatio, winRate, totalTrades: trades.length, profitFactor, avgWinPct, avgLossPct };
}

export default alternateStrategy;
