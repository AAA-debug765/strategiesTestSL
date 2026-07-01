import type {
    Strategy,
    CandleData,
    BacktestResult,
    BacktestOptions
} from "./types";

import { runBacktestEngine } from "../lib/backtest";

const geometryRelease: Strategy = {

    id: "geometry-release-v1",

    name: "Geometry Release",

    description:
        "Trajectory geometry without indicators.",

    parameters: [

        {
            name: "window",
            label: "Window",
            default: 30,
            min: 10,
            max: 80,
            step: 1
        },

        {
            name: "curvatureThreshold",
            label: "Curvature",
            default: 0.0018,
            min: 0.0002,
            max: 0.01,
            step: 0.0002
        },

        {
            name: "efficiencyThreshold",
            label: "Efficiency",
            default: 0.18,
            min: 0.02,
            max: 0.8,
            step: 0.02
        },

        {
            name: "releaseFactor",
            label: "Release",
            default: 0.70,
            min: 0.2,
            max: 1.0,
            step: 0.05
        },

        {
            name: "bodyFactor",
            label: "Body",
            default: 1.8,
            min: 1,
            max: 5,
            step: 0.1
        },

        {
            name: "cooldown",
            label: "Cooldown",
            default: 20,
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

        const {

            window,

            curvatureThreshold,

            efficiencyThreshold,

            releaseFactor,

            bodyFactor,

            cooldown

        } = params;

        const signals = new Array(candles.length).fill(0);

        let cd = 0;

        let previousCurvature = 0;

        for (let i = window + 5; i < candles.length; i++) {

            if (cd > 0) {
                cd--;
                continue;
            }

            let path = 0;

            let displacement = 0;

            let curvature = 0;

            let avgBody = 0;

            for (let j = i - window; j < i; j++) {

                const dx = candles[j].close - candles[j].open;

                path += Math.abs(dx);

                displacement += dx;

                avgBody += Math.abs(dx);

            }

            avgBody /= window;

            for (let j = i - window + 2; j < i; j++) {

                const d0 = candles[j - 2].close - candles[j - 2].open;

                const d1 = candles[j - 1].close - candles[j - 1].open;

                const d2 = candles[j].close - candles[j].open;

                curvature += Math.abs(d2 - 2 * d1 + d0);

            }

            curvature /= window;

            const efficiency =
                path === 0
                    ? 0
                    : Math.abs(displacement) / path;

            const currentBody =
                Math.abs(
                    candles[i].close -
                    candles[i].open
                );

            const release =
                previousCurvature > 0 &&
                curvature <
                    previousCurvature *
                        releaseFactor;

            const compressed =
                curvature >
                    curvatureThreshold &&
                efficiency <
                    efficiencyThreshold;

            if (
                compressed &&
                release &&
                currentBody >
                    avgBody * bodyFactor
            ) {

                if (
                    candles[i].close >
                    candles[i].open
                ) {

                    signals[i] = 1;

                    cd = cooldown;

                } else {

                    signals[i] = -1;

                    cd = cooldown;

                }

            }

            previousCurvature = curvature;

        }

        return runBacktestEngine(
            candles,
            signals,
            params,
            options
        );

    }

};

export default geometryRelease;