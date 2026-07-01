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
  totalReturnPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  winRate: number;
  totalTrades: number;
  profitFactor: number;
  avgWinPct: number;
  avgLossPct: number;
}

export interface BacktestResult {
  trades: Trade[];
  equityCurve: { time: number; value: number }[];
  metrics: BacktestMetrics;
  params: Record<string, number>;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  parameters: StrategyParam[];
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