import { MADRID_SCENARIO } from './scenario-madrid'
import { GREDOS_SCENARIO } from './scenario'
import type { FireScenario } from './scenario'

export const SCENARIOS: FireScenario[] = [MADRID_SCENARIO, GREDOS_SCENARIO]
export const DEFAULT_SCENARIO_ID = MADRID_SCENARIO.id

export function scenarioById(id: string): FireScenario {
  return SCENARIOS.find(item => item.id === id) ?? SCENARIOS[0]
}
