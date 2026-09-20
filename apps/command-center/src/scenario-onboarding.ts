/**
 * El escenario de la primera visita. Vive entero en el navegador: `/onboarding` no habla con la
 * API, así que aquí no hay censo real, ni teléfonos que marcar, ni ancla del ensayo. Quien entra
 * la primera vez practica sobre gente inventada mientras el despliegue sigue atendiendo su
 * evacuación de verdad en `/`.
 *
 * Es el incendio de la Dehesa con menos vecinos —el mapa entra antes y el recorrido no se pelea
 * con 110 puntos— y con el mismo grupo guiado que los pasos necesitan: veinte casas apartadas del
 * campus, a favor del viento, y una que no descuelga.
 *
 * No aparece en el selector del mapa (`SELECTABLE_SCENARIOS`) a propósito: cambiar de escenario en
 * caliente sustituye los ciudadanos por los locales y deja fuera el censo de la API hasta recargar.
 */
import { GUIDED_LOCALITY, MADRID_SCENARIO, guidedFrom, madridCitizens } from './scenario-madrid'
import type { FireScenario, Settlement } from './scenario'

export const ONBOARDING_SCENARIO_ID = 'onboarding'

/** El campus se queda en cuarenta; el grupo guiado conserva sus veinte casas. */
const SETTLEMENTS: Settlement[] = MADRID_SCENARIO.settlements.map(settlement =>
  settlement.name === GUIDED_LOCALITY ? settlement : { ...settlement, count: 40 })

const CITIZENS = madridCitizens(SETTLEMENTS)

export const ONBOARDING_SCENARIO: FireScenario = {
  ...MADRID_SCENARIO,
  id: ONBOARDING_SCENARIO_ID,
  incident: {
    ...MADRID_SCENARIO.incident,
    code: 'SIM-ONB-2026-0920',
    name: 'Simulacro de bienvenida',
    area: 'Escenario de práctica · nadie recibe una llamada',
  },
  settlements: SETTLEMENTS,
  citizens: CITIZENS,
  guided: guidedFrom(CITIZENS),
}
