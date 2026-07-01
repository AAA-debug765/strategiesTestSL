import { NextRequest, NextResponse } from "next/server";
import { getStrategy } from "@/strategies";
import type { BacktestOptions } from "@/strategies/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { strategyId, candles, params, options } = body;
    if (!strategyId || !candles || !Array.isArray(candles)) {
      return NextResponse.json({ error: "strategyId and candles are required" }, { status: 400 });
    }
    const strategy = getStrategy(strategyId);
    if (!strategy) return NextResponse.json({ error: `Strategy "${strategyId}" not found` }, { status: 404 });
    const mergedParams: Record<string, number> = {};
    for (const p of strategy.parameters) mergedParams[p.name] = params?.[p.name] ?? p.default;

    // Pass options directly — let runBacktestEngine handle defaults
    const backtestOptions: BacktestOptions = options ?? {};
    console.log(`[backtest] strategy=${strategyId} capital=${backtestOptions.initialCapital ?? "default(10000)"} candles=${candles.length}`);

    const result = strategy.run(candles, mergedParams, backtestOptions);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Backtest failed" }, { status: 500 });
  }
}