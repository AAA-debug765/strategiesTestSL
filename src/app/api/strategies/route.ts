import { NextResponse } from "next/server";
import { strategies, getStrategiesInfo, getStrategy } from "@/strategies";
import type { StrategyInfo } from "@/strategies";

export interface StrategyStatus extends StrategyInfo { valid: boolean; error?: string; }

export async function GET() {
  const statuses: StrategyStatus[] = [];
  const testCandles = Array.from({ length: 20 }, (_, i) => ({
    time: 1700000000 + i * 60, open: 100 + Math.random() * 10, high: 105 + Math.random() * 10,
    low: 95 + Math.random() * 10, close: 100 + Math.random() * 10, volume: 1000 + Math.random() * 500,
  }));
  for (const strategy of strategies) {
    const info = getStrategiesInfo().find((s) => s.id === strategy.id);
    if (!info) { statuses.push({ ...getStrategy(strategy.id)!, valid: false, error: "Strategy info not found" }); continue; }
    const badParams = info.parameters.filter((p) => p.min > p.max || p.step <= 0 || p.default < p.min || p.default > p.max);
    if (badParams.length > 0) { statuses.push({ ...info, valid: false, error: `Invalid params: ${badParams.map((p) => p.name).join(", ")}` }); continue; }
    try {
      const defaultParams: Record<string, number> = {};
      for (const p of info.parameters) defaultParams[p.name] = p.default;
      const result = strategy.run(testCandles, defaultParams);
      if (!result.trades || !result.equityCurve || !result.metrics) { statuses.push({ ...info, valid: false, error: "Result missing trades, equityCurve or metrics" }); continue; }
      const metrics = result.metrics as Record<string, number>;
      const badMetrics = Object.entries(metrics).filter(([_, v]) => typeof v !== "number" || !isFinite(v));
      if (badMetrics.length > 0) { statuses.push({ ...info, valid: false, error: `Invalid metrics: ${badMetrics.map(([k]) => k).join(", ")}` }); continue; }
      statuses.push({ ...info, valid: true });
    } catch (err) { statuses.push({ ...info, valid: false, error: err instanceof Error ? err.message : String(err) }); }
  }
  return NextResponse.json(statuses);
}