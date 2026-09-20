/**
 * Modo demo autocontenido: población, llamadas, triaje y evacuación viven en el navegador
 * (`scenario.ts` + `simulation.ts`). Sin API, sin HappyRobot, sin claves.
 *
 * Actívalo con `VITE_DEMO_ONLY=true` en `.env` o `npm run build:demo`.
 */
export const DEMO_ONLY = import.meta.env.VITE_DEMO_ONLY === 'true'
