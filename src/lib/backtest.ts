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

  return { trades, equityCurve, metrics: calculateMetrics(trades, equityCurve, initialCapital), params };
}

function calculateMetrics(trades: Trade[], equityCurve: { time: number; value: number }[], initialCapital: number): BacktestMetrics {
  const totalTrades = trades.length;

  if (totalTrades === 0) {
    return {
      totalTrades: 0, wins: 0, losses: 0, winRate: 0,
      maxConsecutiveSl: 0, maxConsecutiveWins: 0,
      grossProfit: 0, grossLoss: 0, netPnl: 0,
      profitFactor: 0, avgPnl: 0, avgWin: 0, avgLoss: 0,
      maxDrawdownPct: 0, maxDrawdownUsd: 0, sharpeRatio: 0,
      score: 0,
    };
  }

  let wins = 0, losses = 0;
  let grossProfit = 0, grossLoss = 0;
  let maxConsecutiveSl = 0, maxConsecutiveWins = 0;
  let slStreak = 0, winStreak = 0;

  for (const t of trades) {
    if (t.pnl >= 0) {
      wins++;
      grossProfit += t.pnl;
      winStreak++;
      slStreak = 0;
      if (winStreak > maxConsecutiveWins) maxConsecutiveWins = winStreak;
    } else {
      losses++;
      grossLoss += Math.abs(t.pnl);
      slStreak++;
      winStreak = 0;
      if (slStreak > maxConsecutiveSl) maxConsecutiveSl = slStreak;
    }
  }

  const winRate = (wins / totalTrades) * 100;
  const netPnl = grossProfit - grossLoss;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const avgPnl = netPnl / totalTrades;
  const avgWin = wins > 0 ? grossProfit / wins : 0;
  const avgLoss = losses > 0 ? grossLoss / losses : 0;

  // Max drawdown from equity curve
  let peak = equityCurve[0]?.value ?? initialCapital;
  let maxDrawdownUsd = 0;
  let maxDrawdownPct = 0;

  for (const pt of equityCurve) {
    if (pt.value > peak) peak = pt.value;
    const dd = peak - pt.value;
    if (dd > maxDrawdownUsd) {
      maxDrawdownUsd = dd;
      maxDrawdownPct = peak > 0 ? (dd / peak) * 100 : 0;
    }
  }

  // Sharpe ratio (simplified, per-trade based on returns)
  const returns = trades.map((t) => t.pnlPct);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - avgReturn) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  return {
    totalTrades, wins, losses, winRate,
    maxConsecutiveSl, maxConsecutiveWins,
    grossProfit, grossLoss, netPnl,
    profitFactor, avgPnl, avgWin, avgLoss,
    maxDrawdownPct, maxDrawdownUsd, sharpeRatio,
    score: 0, // will be set by optimizer using strategy's optimizeGoal
  };
}