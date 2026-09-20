import { MADRID_SCENARIO } from './scenario-madrid'
import { GREDOS_SCENARIO } from './scenario'
import { ONBOARDING_SCENARIO } from './scenario-onboarding'
import type { FireScenario } from './scenario'

export const SCENARIOS: FireScenario[] = [MADRID_SCENARIO, GREDOS_SCENARIO, ONBOARDING_SCENARIO]
/**
 * Los que ofrece el selector del mapa. El de bienvenida no sale ahí: se sirve en `/onboarding` y
 * cambiar de escenario en caliente reemplaza los ciudadanos por los locales, dejando el censo de
 * la API fuera del mapa hasta que se recargue la página.
 */
export const SELECTABLE_SCENARIOS: FireScenario[] = [MADRID_SCENARIO, GREDOS_SCENARIO]
export const DEFAULT_SCENARIO_ID = MADRID_SCENARIO.id
export const ONBOARDING_SCENARIO_ID = ONBOARDING_SCENARIO.id

export function scenarioById(id: string): FireScenario {
  return SCENARIOS.find(item => item.id === id) ?? MADRID_SCENARIO
}
