# Marco regulatorio: AI Act, ENS, RGPD y contratación pública

> **Actualizado:** 2026-09-18 · **Estado:** estable (verificar fechas del AI Act antes de
> afirmarlas en público — hay un aplazamiento reciente)
> **En una frase:** clasificar llamadas de emergencia es **alto riesgo por nombre propio**
> en el AI Act; ser proveedor de lo público te mete en el **ENS**; y una catástrofe abre
> la puerta de la **tramitación de emergencia** del art. 120 LCSP, que es la única vía
> rápida de venta que existe.

## 1. EU AI Act — Reglamento (UE) 2024/1689

### Lo que nos afecta directamente

**Anexo III, punto 5(d)** clasifica como **alto riesgo**:

> *"Sistemas de IA destinados a evaluar y clasificar llamadas de emergencia realizadas por
> personas físicas o a utilizarse para despachar servicios de primera intervención de
> emergencia, o para establecer prioridades en el despacho de dichos servicios, incluidos
> policía, bomberos y asistencia médica, así como sistemas de triaje de pacientes de
> emergencias sanitarias."*

Puntos críticos de interpretación:

- La clasificación depende de la **finalidad prevista**, no del sector ni de la
  tecnología. Da igual que sea una red neuronal o una tabla de reglas.
- **Que un humano pulse "enviar" no cambia la clasificación.** Si la salida del sistema
  influye en la priorización, está dentro.
- Cubre toda la cadena: desde que entra la llamada hasta que se asigna una unidad.
- **Art. 6(3)** permite autoevaluarse fuera del alto riesgo cuando el papel del sistema es
  genuinamente **procedimental o preparatorio** y el humano decide de verdad. Pero
  **si el sistema perfila personas físicas, la puerta se cierra**, sea cual sea el resto.

### Fechas (⚠️ verificar antes de citar)

| Obligación | Fecha original | Situación |
| --- | --- | --- |
| Art. 5 — prácticas prohibidas | 2 feb 2025 | **En vigor** |
| Obligaciones de modelos de propósito general | 2 ago 2025 | **En vigor** |
| **Art. 50 — transparencia** (avisar de que se habla con una IA) | 2 ago 2026 | **En vigor, sin cambios** |
| Anexo III alto riesgo autónomo (dispatch/triaje) | 2 ago 2026 | **Aplazado a 2 dic 2027** por el Digital Omnibus |
| Alto riesgo embebido en productos regulados | 2 ago 2027 | Aplazado a 2 ago 2028 |

El acuerdo del Digital Omnibus es de may-2026; hay que **confirmar el texto publicado en
el DOUE**, no el acuerdo político. Fuente secundaria, tratar con cuidado.

**Implicación práctica:** el aplazamiento nos da margen para el alto riesgo, pero
**el deber de transparencia ya está vigente**. Cualquier agente que hable con un ciudadano
tiene que decir que es una IA. Sin excepción, sin letra pequeña.

La propia documentación de HappyRobot lo asume: *"una llamada de teléfono no cuenta como
obvio"*, y en despliegues EU el disclaimer pregrabado **viene activado por defecto** en los
nodos de voz. Cómo se configura, en
[`../02-happyrobot/02-plataforma.md`](../02-happyrobot/02-plataforma.md), sección
"Cumplimiento".

### Si asumimos alto riesgo, ¿qué toca?

Al **deployer** (la administración que lo usa, incluso vía API dentro de software
comprado): usarlo según las instrucciones del proveedor, asignar supervisión humana con
autoridad real de intervención, garantizar que los datos de entrada son relevantes y
representativos, monitorizar y **suspender el uso ante sospecha de riesgo grave**,
conservar los logs e informar a los trabajadores y sus representantes.

> HIPÓTESIS de diseño: si conseguimos que el agente **nunca clasifique ni priorice** —solo
> informe, registre, transfiera o llame de salida— nos quedamos fuera del 5(d) con un
> argumento sólido. En cuanto ordenamos una cola, entramos.

## 2. ENS — Esquema Nacional de Seguridad (RD 311/2022)

- **Art. 2.3**: el ENS alcanza a los sistemas de información de entidades **privadas**
  cuando, por relación contractual, prestan servicios o soluciones al sector público para
  el ejercicio de sus competencias. No te obliga por ser privado: te obliga por ser
  proveedor de lo público.
- Los pliegos **deben** incluir los requisitos para asegurar la conformidad, y la cautela
  **se extiende a la cadena de suministro** del contratista. Es decir: también a los
  proveedores de LLM, TTS y telefonía que haya debajo.
- Acreditación según categoría del sistema:
  - **BÁSICA** → Declaración de Conformidad.
  - **BÁSICA / MEDIA / ALTA** → **Certificación** de Conformidad, por entidad de
    certificación acreditada por ENAC.
  - Auditoría al menos **cada dos años** (art. 34 y anexo III del RD 311/2022).
- El TACRC ha confirmado que la exigencia puede aparecer como requisito de habilitación,
  criterio de solvencia técnica, criterio de adjudicación o condición especial de
  ejecución. Cada órgano de contratación lo redacta a su manera.

> Un sistema que atiende llamadas de emergencia sería con casi total seguridad categoría
> **ALTA**. Eso es certificación, auditoría bienal y probablemente despliegue en VPC/on-prem
> con residencia en España. HappyRobot soporta técnicamente lo último; no consta que tenga
> certificación ENS. **[SIN VERIFICAR]**

## 3. RGPD

- Datos de salud, localización y situaciones de vulnerabilidad → categorías especiales,
  base jurídica normalmente **interés vital / misión de interés público**, no consentimiento.
- Grabaciones y transcripciones: retención mínima, cifrado, borrado automático.
  HappyRobot ofrece políticas de retención **por workflow**, lo cual encaja.
- HappyRobot declara que los datos del cliente **no se usan para entrenar** ni se comparten
  entre tenants, pero se reserva "Aggregated Data" y "Learnings" desidentificados. En un
  contrato público eso hay que negociarlo explícitamente.
- Detalle curioso y útil: **ES-Alert no cae bajo protección de datos** porque el Cell
  Broadcast emite a todas las antenas del área sin conocer los números. Contraste directo
  con cualquier campaña de llamadas salientes, que sí trata datos personales.

## 4. Contratación pública: la vía rápida existe

**Art. 120 LCSP (Ley 9/2017) — tramitación de emergencia.** Ante acontecimientos
catastróficos, el órgano de contratación puede **ordenar la ejecución sin tramitar
expediente**, sin ajustarse a los requisitos formales de la ley e **incluso sin existencia
previa de crédito**. Es el único supuesto donde se admite **contratación verbal** (art. 37).

- Usado masivamente en COVID-19, el volcán de La Palma (2021), la DANA (2024) y los
  incendios forestales.
- Para la DANA: Orden PJC/1222/2024 (Acuerdo del Consejo de Ministros de 5-nov-2024)
  declaró "zona afectada gravemente por una emergencia de protección civil" y reguló el
  régimen de contratación. La disp. adic. 8ª del RD-ley 7/2024 amplió el plazo de inicio de
  ejecución hasta 3 meses desde la aprobación del expediente.
- Límites que marcó la JCCPE (Informe 1/2025, consulta de la alcaldesa de Catarroja): la
  actuación debe limitarse a **lo estrictamente indispensable** en objeto y tiempo, y hay
  que **acreditar** que no cabía un procedimiento menos restrictivo de la concurrencia.
  Análisis singularizado y motivado de cada actuación.

> Consecuencia estratégica: en gestión de crisis, **la venta ocurre durante la crisis**, no
> antes. Eso implica que el producto tiene que estar **precablead­o y desplegable en horas**,
> con el trabajo de integración hecho *a priori* aunque el contrato llegue después. Es un
> modelo de negocio distinto: preparación permanente, activación bajo emergencia.

## Preguntas abiertas

- [ ] Confirmar en el DOUE las fechas definitivas del Digital Omnibus.
- [ ] ¿Tiene HappyRobot certificación o declaración ENS? ¿Alguna CCAA lo ha exigido ya?
- [ ] ¿Hay guía de la AESIA (autoridad española de supervisión de IA) sobre Anexo III 5(d)?
- [ ] ¿Cómo encaja la "tramitación de emergencia" con un servicio SaaS de suscripción?

## Fuentes

- AI Act Service Desk (Comisión Europea) — Anexo III — https://ai-act-service-desk.ec.europa.eu/en/ai-act/annex-3 (2026-09-18)
- aiactinfo.eu — Annex III — https://aiactinfo.eu/annex/3 (2026-09-18)
- Confir — AI Emergency Dispatch: High-Risk (Annex III) — https://confir.eu/annex-iii/emergency-services-dispatch (2026-09-18)
- AI Act Verdict — AI emergency call triage under the EU AI Act — https://aiactverdict.com/is-ai-emergency-call-triage-high-risk/ (2026-09-18)
- Rayvn — Emergency Dispatch AI Is High-Risk Under the EU AI Act. The Deadline Just Moved. — https://rayvn.global/blog/eu-ai-act-emergency-dispatch-high-risk/ (2026-09-18)
- BOE — Real Decreto 311/2022 (ENS) — https://www.boe.es/eli/es/rd/2022/05/03/311/dof/spa/pdf (2026-09-18)
- CCN-CERT — ENS FAQ — https://ens.ccn.cni.es/es/que-es-el-ens/faq (2026-09-18)
- Andersen — Conformidad con el ENS: un requisito determinante en las licitaciones públicas — https://es.andersen.com/conformidad-con-el-esquema-nacional-de-seguridad-ens-un-requisito-determinante-en-las-licitaciones-publicas/ (2026-09-18)
- Derecho Local — Tramitación de emergencia para ayuntamientos afectados por la DANA (Informe JCCPE 1/2025) — https://derecholocal.es/criterio-novedoso/utilizacion-por-los-ayuntamientos-afectados-por-la-dana-de-la-tramitacion-de-emergencia-para-ejecutar-obras (2026-09-18)
- Life Sector Público — Contratación pública en situaciones de emergencia — https://lifesectorpublico.com/contratacion-de-las-entidades-locales-en-la-situacion-de-emergencia-provocada-por-la-dana/ (2026-09-18)
- HappyRobot — License Agreement (Aggregated Data / Learnings) — https://www.happyrobot.ai/legal/license-agreement (2026-09-18)
