import type {
    Strategy,
    CandleData,
    BacktestResult,
    BacktestOptions
} from "./types";

import { runBacktestEngine } from "../lib/backtest";

const memoryHoleStrategy: Strategy = {
    id: "memory-hole-v1",

    name: "Price Memory Hole",
    description:
        "Detects candles that are structurally irreplaceable in local window geometry.",

    parameters: [
        {
            name: "window",
            label: "Window",
            default: 20,
            min: 10,
            max: 80,
            step: 1
        },
        {
            name: "importanceThreshold",
            label: "Importance",
            default: 1.5,
            min: 0.5,
            max: 5,
            step: 0.1
        },
        {
            name: "dominanceRatio",
            label: "Dominance",
            default: 2.0,
            min: 1.0,
            max: 5,
            step: 0.1
        },
        {
            name: "cooldown",
            label: "Cooldown",
            default: 15,
            min: 0,
            max: 100,
            step: 1
        }
    ],

    run(
        candles: CandleData[],
        params: Record<string, number>,
        options?: BacktestOptions
    ): BacktestResult {

        const window = params.window;
        const importanceThreshold = params.importanceThreshold;
        const dominanceRatio = params.dominanceRatio;
        const cooldownBars = params.cooldown;

        const signals = new Array(candles.length).fill(0);

        let cooldown = 0;

        function modelError(start: number, end: number): number {
            let sumX = 0;
            let sumY = 0;
            let sumXX = 0;
            let sumXY = 0;
            let n = 0;

            for (let i = start; i < end; i++) {
                const x = i - start;
                const y = candles[i].close - candles[i].open;
                sumX += x;
                sumY += y;
                sumXX += x * x;
                sumXY += x * y;
                n++;
            }

            const denom = n * sumXX - sumX * sumX;
            if (denom === 0) return 0;

            const b = (n * sumXY - sumX * sumY) / denom;
            const a = (sumY - b * sumX) / n;

            let error = 0;
            for (let i = start; i < end; i++) {
                const x = i - start;
                const y = candles[i].close - candles[i].open;
                const pred = a + b * x;
                error += Math.abs(y - pred);
            }

            return error;
        }

        for (let i = window + 5; i < candles.length; i++) {

            if (cooldown > 0) {
                cooldown--;
                continue;
            }

            const start = i - window;
            const end = i;

            const baseError = modelError(start, end);

            let maxImpact = -Infinity;
            let maxIndex = -1;

            for (let j = start; j < end; j++) {
                const errorWithout =
                    modelError(start, j) +
                    modelError(j + 1, end);

                const impact = errorWithout - baseError;

                if (impact > maxImpact) {
                    maxImpact = impact;
                    maxIndex = j;
                }
            }

            const current = candles[i];
            const body = Math.abs(current.close - current.open);
            const prevBody =
                Math.abs(candles[i - 1].close - candles[i - 1].open);

            const isDominant =
                body > prevBody * dominanceRatio;

            const isImportant =
                maxImpact > importanceThreshold &&
                maxIndex === i - 1;

            if (isImportant && isDominant) {
                if (current.close > current.open) {
                    signals[i] = 1;
                } else {
                    signals[i] = -1;
                }
                cooldown = cooldownBars;
            }
        }

        return runBacktestEngine(candles, signals, params, options);
    }
};

export default memoryHoleStrategy;