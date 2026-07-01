import type { Strategy, StrategyParam } from "./types";
import residualCoherence from "./residual-coherence";

export const strategies: Strategy[] = [residualCoherence];
export function getStrategy(id: string): Strategy | undefined {
  return strategies.find((s) => s.id === id);
}
export interface StrategyInfo {
  id: string; name: string; description: string; parameters: StrategyParam[];
}
export function getStrategiesInfo(): StrategyInfo[] {
  return strategies.map((s) => ({ id: s.id, name: s.name, description: s.description, parameters: s.parameters }));
}