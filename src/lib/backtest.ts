import type { CandleData, BacktestResult, Trade, BacktestMetrics, BacktestOptions } from "../strategies/types";

const DEFAULT_INITIAL_CAPITAL = 10000;

export function runBacktestEngine(
  candles: CandleData[], signals: number[], params: Record<string, number> = {}, options: BacktestOptions = {}
): BacktestResult {
  const initialCapital = options.initialCapital ?? DEFAULT_INITIAL_CAPITAL;
  const feePct = options.feePct ?? 0;
  const tpPct = options.tpPct ?? 0;
  const slPct = options.slPct ?? 0;
  const tpUsdt = options.tpUsdt ?? 0;
  const slUsdt = options.slUsdt ?? 0;
  const tpPriceDist = options.tpPrice ?? 0;
  const slPriceDist = options.slPrice ?? 0;
  const exitOnSignal = options.exitOnSignal !== false;

  let equity = initialCapital;
  let position = 0;
  let entryPrice = 0;
  let entryTime = 0;
  let entryType: "long" | "short" = "long";
  let entryEquity = 0;
  const trades: Trade[] = [];
  const equityCurve: { time: number; value: number }[] = [];

  function getTpPrice(price: number): number {
    if (tpPct > 0) return entryType === "long" ? price * (1 + tpPct / 100) : price * (1 - tpPct / 100);
    if (tpUsdt > 0 && initialCapital > 0) { const units = initialCapital / price; return entryType === "long" ? price + tpUsdt / units : price - tpUsdt / units; }
    if (tpPriceDist > 0) return entryType === "long" ? price + tpPriceDist : price - tpPriceDist;
    return Infinity;
  }
  function getSlPrice(price: number): number {
    if (slPct > 0) return entryType === "long" ? price * (1 - slPct / 100) : price * (1 + slPct / 100);
    if (slUsdt > 0 && initialCapital > 0) { const units = initialCapital / price; return entryType === "long" ? price - slUsdt / units : price + slUsdt / units; }
    if (slPriceDist > 0) return entryType === "long" ? price - slPriceDist : price + slPriceDist;
    return 0;
  }
  function closeTrade(exitPrice: number, exitTime: number, reason: "signal" | "tp" | "sl" | "eod") {
    const closeValue = equity + position * (exitPrice - entryPrice);
    const exitFee = closeValue * feePct / 100;
    const entryFee = entryEquity * feePct / 100;
    const pnl = closeValue - entryEquity - entryFee - exitFee;
    const pnlPct = entryEquity > 0 ? (pnl / entryEquity) * 100 : 0;
    trades.push({ type: entryType, entryTime, entryPrice, exitTime, exitPrice, pnl, pnlPct, fee: entryFee + exitFee, exitReason: reason });
    equity = closeValue - exitFee - entryFee;
    position = 0;
  }

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const signal = signals[i];
    let currentEquity = equity;
    if (position !== 0) currentEquity = equity + position * (candle.close - entryPrice);
    equityCurve.push({ time: candle.time, value: currentEquity });

    let skipSignal = false;

    if (position !== 0) {
      const tpPrice = getTpPrice(entryPrice);
      const slPrice = getSlPrice(entryPrice);
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
      if (triggered) { closeTrade(triggerPrice, candle.time, triggered); skipSignal = true; }
    }

    if (!skipSignal) {
      if (signal === 1 && position === 0) {
        entryEquity = equity; position = equity / candle.close; entryPrice = candle.close; entryTime = candle.time; entryType = "long";
      } else if (signal === -1 && position === 0) {
        entryEquity = equity; position = -(equity / candle.close); entryPrice = candle.close; entryTime = candle.time; entryType = "short";
      } else if (exitOnSignal && signal === 1 && position < 0) {
        closeTrade(candle.close, candle.time, "signal");
        entryEquity = equity; position = equity / candle.close; entryPrice = candle.close; entryTime = candle.time; entryType = "long";
      } else if (exitOnSignal && signal === -1 && position > 0) {
        closeTrade(candle.close, candle.time, "signal");
        entryEquity = equity; position = -(equity / candle.close); entryPrice = candle.close; entryTime = candle.time; entryType = "short";
      }
    }
  }

  if (position !== 0 && candles.length > 0) {
    const lastCandle = candles[candles.length - 1];
    closeTrade(lastCandle.close, lastCandle.time, "eod");
    if (equityCurve.length > 0) equityCurve[equityCurve.length - 1].value = equity;
  }

  return { trades, equityCurve, metrics: calculateMetrics(trades), params };
}

function calculateMetrics(trades: Trade[]): BacktestMetrics {
  // Максимальное количество SL подряд
  let maxConsecutiveSl = 0;
  let currentStreak = 0;
  for (const t of trades) {
    if (t.exitReason === "sl") {
      currentStreak++;
      if (currentStreak > maxConsecutiveSl) maxConsecutiveSl = currentStreak;
    } else {
      currentStreak = 0;
    }
  }
  return { totalTrades: trades.length, maxConsecutiveSl };
}