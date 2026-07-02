export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StrategyParam {
  name: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface Trade {
  type: "long" | "short";
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  fee: number;
  exitReason?: "signal" | "tp" | "sl" | "eod";
}

export interface BacktestMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  maxConsecutiveSl: number;
  maxConsecutiveWins: number;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  profitFactor: number;
  avgPnl: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdownPct: number;
  maxDrawdownUsd: number;
  sharpeRatio: number;
  score: number; // optimization score (set by strategy's optimizeGoal, lower = better)
}

export interface BacktestResult {
  trades: Trade[];
  equityCurve: { time: number; value: number }[];
  metrics: BacktestMetrics;
  params: Record<string, number>;
}

export interface OptimizeColumn {
  key: string;
  label: string;
  format?: (v: number) => string;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  parameters: StrategyParam[];
  /** Columns to display in optimization results table. Defaults to common set. */
  optimizeColumns?: OptimizeColumn[];
  /**
   * Custom optimization scoring function.
   * Receives BacktestMetrics, returns a number (lower = better).
   * If not set, uses default: maxConsecutiveSl / totalTrades.
   */
  optimizeGoal?: (metrics: BacktestMetrics) => number;
  run: (candles: CandleData[], params: Record<string, number>, options?: BacktestOptions) => BacktestResult;
}

export type Signal = 1 | -1 | 0;

export interface BacktestOptions {
  initialCapital?: number;
  tpPct?: number;
  slPct?: number;
  feePct?: number;
  tpUsdt?: number;
  slUsdt?: number;
  tpPrice?: number;
  slPrice?: number;
  exitOnSignal?: boolean;
}

export interface OptimizeResult {
  params: Record<string, number>;
  metrics: BacktestMetrics;
}

/** Default columns shown when strategy doesn't define optimizeColumns */
export const DEFAULT_OPTIMIZE_COLUMNS: OptimizeColumn[] = [
  { key: "score", label: "Score" },
  { key: "totalTrades", label: "Trades" },
  { key: "winRate", label: "Win %" },
  { key: "profitFactor", label: "PF" },
  { key: "maxConsecutiveSl", label: "Max SL" },
  { key: "netPnl", label: "Net PnL" },
  { key: "maxDrawdownPct", label: "DD %" },
];