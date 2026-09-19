# Nota de investigación — 2026-09-18: barrido inicial

> **Actualizado:** 2026-09-18 · **Estado:** cerrada
> **En una frase:** primer barrido sobre HappyRobot, el sistema español de emergencias y
> el marco regulatorio; conclusión operativa: el caso de uso defendible está en el
> **perímetro** del 112 (salientes, no-emergencia, post-crisis), no en el 112.

## Qué se buscó

1. Qué hace HappyRobot hoy, con qué clientes y con qué tecnología.
2. Cómo funciona la gestión de crisis en España y dónde falló en la DANA.
3. Qué precedentes hay de IA de voz en servicios de emergencia.
4. Qué barreras regulatorias y de compra pública existen.
5. Qué se sabe del track de HackSpain.

## Hallazgos que cambian la estrategia

1. **HappyRobot ya no es "la startup de logística".** Serie C de $150M a $1.200M en
   ago-2026, 150+ clientes, expandiendo a energía, telco, seguros y aerolíneas.
   **Naturgy y Repsol son clientes**: ya operan servicios esenciales en España.
   → No hay que convencerles de salir de logística. Ya salieron.
2. **El Anexo III 5(d) del AI Act nombra literalmente el triaje de llamadas de emergencia.**
   → Cualquier propuesta que clasifique o priorice llamadas del 112 es alto riesgo por
   definición. Hay que diseñar alrededor de eso, no ignorarlo.
3. **En EEUU el patrón desplegado es unánime: IA en la línea de no-emergencia, nunca en el
   911.** Y ~60% del volumen de un centro es no-emergencia.
   → Ese es el hueco, y tiene validación de mercado real.
4. **El fallo de la DANA fue de agregación de información, no de falta de información.**
   19.821 llamadas, 4.943 de ellas en las tres horas *previas* al ES-Alert.
   → Hay un producto en convertir el flujo de llamadas en situational awareness.
5. **Art. 120 LCSP permite contratar sin expediente, sin concurrencia y hasta verbalmente
   en catástrofe.** → La venta ocurre *durante* la crisis. El producto debe estar
   precableado y activable en horas.
6. **El precedente del hackathon de dic-2025 premia casos humanos, salientes y
   demostrables en vivo** (MedTracker, TravelBot, Santa's Call), no proezas técnicas.

7. **Hallazgo tardío: ya teníamos la documentación oficial completa mirrorizada** en
   `docs/_inbox/2026-09-18-happyrobot-docs-oficiales/`. Aporta cosas que no están en la web
   pública y que cambian el alcance de lo construible en 36 h: **Signals** (eventos a un
   agente en mitad de la llamada), **Twin** (Postgres gestionado con run dumps
   automáticos), **Apps** (frontend desplegado dentro de la plataforma), **MCP con OAuth
   2.1 por HTTP**, y una página entera de **cumplimiento del AI Act art. 50 y RGPD** con
   el disclaimer pregrabado activado por defecto en EU.

## Lo que NO se pudo verificar

- ~~`docs.happyrobot.ai` está tras un access code~~ → **resuelto**: hay mirror local
  completo. Ver [`../02-happyrobot/00-documentacion-oficial.md`](../02-happyrobot/00-documentacion-oficial.md).
- No consta **ningún cliente público** de HappyRobot a fecha de hoy.
- No consta certificación **ENS** de HappyRobot.
- Enunciado y criterios del track: no publicados.
- Fechas definitivas del Digital Omnibus del AI Act: solo fuentes secundarias.

## Siguientes pasos

- [ ] Meter los materiales oficiales del track en `docs/_inbox/` y destilarlos a
      `docs/01-evento/`.
- [ ] Preguntar a los mentores de HappyRobot: sector público, ENS, acceso a MCP/SDK,
      límites del entorno del hackathon.
- [ ] Buscar el dato español de % de llamadas no-emergencia en el 112.
- [ ] Buscar si algún 112 autonómico tiene ya piloto de IA.
- [ ] Escribir `01-vigia.md` una vez fijado el caso de uso.

## Fuentes

Consolidadas en los documentos destino:
[`02-happyrobot/01-la-empresa.md`](../02-happyrobot/01-la-empresa.md),
[`02-happyrobot/02-plataforma.md`](../02-happyrobot/02-plataforma.md),
[`03-dominio-crisis/01-sistema-emergencias-espana.md`](../03-dominio-crisis/01-sistema-emergencias-espana.md),
[`04-regulacion/01-marco-regulatorio.md`](../04-regulacion/01-marco-regulatorio.md),
[`01-evento/01-hackspain-2026.md`](../01-evento/01-hackspain-2026.md).
