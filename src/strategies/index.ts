import type { Strategy, StrategyParam } from "./types";
import maCrossStrategy from "./ma-cross";
import rsiStrategy from "./rsi";
import bollingerStrategy from "./bollinger";
import compressionStateMachine from "./compression-state-machine";
import geometryRelease from "./geometry-release";
import memoryHole from "./memory-hole";
import candleEnergyStrategy from "./candle-energy";
import alternateStrategy from "./alternate";
import stochRciStrategy from "./stoch-rci";

export const strategies: Strategy[] = [maCrossStrategy, rsiStrategy, bollingerStrategy, compressionStateMachine, geometryRelease, memoryHole, candleEnergyStrategy, alternateStrategy, stochRciStrategy];
export function getStrategy(id: string): Strategy | undefined {
  return strategies.find((s) => s.id === id);
}
export interface StrategyInfo {
  id: string; name: string; description: string; parameters: StrategyParam[];
}
export function getStrategiesInfo(): StrategyInfo[] {
  return strategies.map((s) => ({ id: s.id, name: s.name, description: s.description, parameters: s.parameters }));
}