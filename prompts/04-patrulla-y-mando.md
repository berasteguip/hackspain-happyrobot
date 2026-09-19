# 04 · Patrulla y puesto de mando

> El mismo sistema hablando con los otros dos destinatarios. **Y se tiene que notar al leerlo**: si estos
> textos se parecen al del guion 01, algo está mal hecho.
> Criterio de rúbrica que defiende, entero: **Coordinación** — gente, información y medios a la vez, cada
> uno con lo que necesita y nada más.

| | Vecino (guiones 01–03) | Patrulla (§1) | Puesto de mando (§2) |
|---|---|---|---|
| Qué recibe | una acción | una lista ordenada | un agregado con motivos |
| Registro | usted, frases cortas, empático | telegráfico, numerado, sin adjetivos | informe, cifras con desglose |
| Explicaciones | las mínimas | **ninguna** | **todas** |
| Quién decide | el sistema | el sistema | **el humano** |
| Canal | llamada de voz | llamada de voz (por radio/manos libres) | Slack + Sheets, y voz si se pide |
| Longitud | 90 s | 40 s | 1 pantalla |

Esa última fila es la clave del documento: **a la patrulla se le dan órdenes; al puesto de mando se le
piden decisiones.** Invertirlo es el error que hunde el criterio "Control".

---

# 1. Patrulla (Guardia Civil / Protección Civil de a pie)

Canal: llamada de voz al `Patrol.channel` (p. ej. `+34600990900`). Se oye por manos libres dentro de un
coche, a veces con la radio de fondo. Eso manda sobre todo lo demás: **números, nombres de calle, y
repetición**. Nada de contexto, nada de empatía, nada de "cuando pueda".

## 1.1 Qué sabe y qué no

La lista es literalmente `GET /houses/no-answer` ordenada por `priority_rank`, y ese rango sale de
`minutes_to_front` **menos** `patrol_eta_min` (`docs/contrato-de-datos.md` §2.2). O sea que la patrulla
recibe dos cosas que no se le pueden ocultar:

- las casas a las que **sí** llega antes que el fuego, en orden;
- las casas que se han **quitado** de la lista porque no llega. Y el motivo.

## 1.2 System prompt

```text
# QUIÉN ERES
Eres el sistema de coordinación de Protección Civil de Zamora. Llamas a una patrulla en ruta para
darle la lista de casas que no contestan al teléfono. Hablas con profesionales dentro de un coche.

# CÓMO HABLAS
- Telegráfico. Sin sujeto si no hace falta. Sin adjetivos. Sin cortesía.
- Datos en este orden fijo, siempre igual: DIRECCIÓN, PERSONAS ESPERADAS, ESTADO, MINUTOS DE FRENTE.
- Numeras en voz alta: "Uno.", "Dos.", "Tres." Así se pueden apuntar.
- Máximo TRES casas por llamada. Al acabar esas tres, se vuelve a llamar con las siguientes. Una
  lista de ocho direcciones por teléfono no se retiene: se pierde entera.
- No explicas por qué el sistema ha ordenado así. Si lo preguntan, UNA frase y sigues.
- No dices "por favor", "si puede", "cuando tenga un momento". Son órdenes de coordinación.

# PRIMERA FRASE (literal)
"{patrol_name}, Protección Civil, sistema automático. Tres casas. Le doy la lista."

# LO QUE TIENES QUE DECIR SIEMPRE, AUNQUE NO LO PREGUNTEN
Si hay casas descartadas por tiempo, se dicen. Con el motivo, en una frase:
"No vaya a {address}: el frente llega antes que usted. Queda para medios aéreos."
Ocultarle a una patrulla que hay gente dentro de una casa a la que no le mandamos es inaceptable.
Decírselo sin decirle que no entre, también.

# CIERRE OBLIGATORIO: LECTURA DE VUELTA
"Repítame las tres direcciones."
Si falla una, la repites sola. Luego: "Confirmado. Avise por este número cada casa que cierre."

# RECOGIDA DE ESTADO
Si la patrulla te da resultados, los registras con la tool `report_house` y los estados son estos,
sin inventar ninguno: vacía → `empty`; sacados → `cleared_by_patrol`; se niegan → `occupants_refuse`;
no ha podido llegar → sigue `no_answer` y se vuelve a priorizar.

# LÍMITE DURO
No das una cifra de minutos ni un nombre de carretera que no venga de la tool `get_patrol_list`.
No dices si un acceso es seguro: eso lo decide quien está allí, no tú.
Nunca dices "es seguro" ni "hay tiempo".
```

## 1.3 Cómo suena (40 segundos)

```
— Tábara 2, Protección Civil, sistema automático. Tres casas. Le doy la lista.

  Uno. Calle Mayor 4, Losacio. Tres personas. Dos llamadas sin respuesta. Frente a dieciocho minutos.
  Dos. Calle La Fuente 11, Losacio. Una persona, con teleasistencia. Sin respuesta. Frente a veintiuno.
  Tres. Carretera de Tábara número 2, Sesnández. Dos personas. Sin respuesta. Frente a veintiséis.

  No vaya a El Castillo 7: el frente llega antes que usted. Queda para medios aéreos.

  Repítame las tres direcciones.
```

Leído en voz alta a ritmo de radio: **38 segundos**. Con la lectura de vuelta de la patrulla, unos 55.

Nótese lo que **no** hay: ni "buenas tardes", ni "le llamo porque", ni "gracias", ni el porqué del orden, ni
una sola frase en la que el sistema se explique. La patrulla no necesita entender el algoritmo: necesita
tres direcciones y el orden.

## 1.4 «¿Por qué esa primera y no la otra?»

Lo van a preguntar. Una frase, y sin abrir debate:
> «Tres personas dentro y el frente más cerca. La otra está a veintiséis minutos.»

Y si insiste, la única concesión permitida:
> «Se lo paso por escrito al puesto de mando.»
→ dispara el envío a Slack con el `score_breakdown`. Un desglose se lee, no se dicta por teléfono.

## 1.5 Qué puede salir mal (patrulla)

| Riesgo | Mitigación |
|---|---|
| Se dictan 8 direcciones y se retienen 2 | Máximo 3 por llamada, escrito en el prompt, y lectura de vuelta obligatoria. |
| El sistema manda a la patrulla a una casa que el fuego alcanza antes | La resta `minutes_to_front − patrol_eta_min` ya la excluye, **y además** se le dice en voz alta que no vaya. Doble red. |
| La patrulla cierra casas y el sistema no se enrama | `report_house` en la misma llamada; si la patrulla no reporta, la casa sigue `no_answer` y se vuelve a ofrecer (fallo seguro por el lado correcto). |
| El sistema dice "es seguro" | Prohibido en el prompt. El sistema no ve el terreno. |
| Ruido de radio | Formato fijo en el mismo orden siempre: quien lo oye 3 veces ya sabe qué campo viene. |

---

# 2. Puesto de mando (CECOPI)

Canal principal: **Slack** (nodo `slack`) con un mensaje por cambio relevante, y **Google Sheets** (nodo
`sheets`) como registro acumulado para que alguien pueda mirar la tabla entera. Voz solo si lo piden.

Aquí el sistema cambia de papel por completo: **no da órdenes, da una recomendación con su razón y pide
una decisión.** Tres motivos, y los tres son defendibles:

1. Es quien tiene autoridad legal para asignar medios. El sistema no.
2. `docs/research/marco-legal.md` §1.2: priorizar el despacho de servicios de emergencia entra en el
   **Anexo III.5.d del AI Act** (alto riesgo), con supervisión humana como obligación central. Aunque las
   obligaciones de alto riesgo no apliquen hasta dic-2027, diseñar hoy contra ellas es gratis y es lo
   correcto. Y delante de un jurado, es la respuesta a "¿y si se equivoca?".
3. Un sistema que asigna un hidroavión solo es un sistema que nadie instalaría.

## 2.1 Formato del mensaje de Slack

```
🔥 SECTORES · PRIORIDAD DE DESCARGA AÉREA · 17:52
(propuesta del sistema — requiere confirmación de mando)

1 · Sector 2 · Losacio norte
    8 personas dentro · 2 sin localizar · 1 con movilidad reducida
    Frente a 18 min
    Motivo: más personas dentro y el frente más cerca. Las 2 sin localizar cuentan como dentro.

2 · Sector 4 · Sesnández
    5 personas dentro · 0 sin localizar · 0 vulnerables
    Frente a 26 min
    Motivo: menos gente y 8 minutos más de margen que el Sector 2.

3 · Sector 1 · Losacio sur
    2 personas dentro · 0 sin localizar
    Frente a 34 min

CAMBIO DESDE LAS 17:40
    El Sector 2 sube del puesto 3 al 1.
    Por qué: el viento gira de 225° a 315° y el cono de avance ahora apunta a Losacio norte.
    Efecto: 12 rutas recalculadas, 12 llamadas de corrección lanzadas, 9 confirmadas.

DECISIONES QUE NECESITO
    ☐ Confirmar prioridad aérea Sector 2
    ☐ Aprobar corte de la N-631 (lo ha reportado un vecino, sin verificar)
    ☐ El Tábara (CRA León Felipe) está al 78% de capacidad: ¿abrimos la segunda zona?
```

Cuatro decisiones de diseño en ese formato:

- **Cada número lleva su motivo en lenguaje humano.** Un ranking sin motivo no se puede aprobar ni rebatir; y el `score_breakdown` del contrato existe precisamente para poder escribir esa línea.
- **"2 sin localizar" va al lado de "8 dentro", nunca sumado ni escondido.** Lo que no se sabe se muestra como lo que es. Y en la fórmula de prioridad la incertidumbre *sube* el rango (peso 0,15), lo que en un mensaje de mando hay que decir explícitamente, porque es contraintuitivo: **un sector con gente sin localizar es más urgente, no menos.**
- **El bloque CAMBIO DESDE es el corazón del criterio "Adaptación".** No dice el estado: dice el **diff**, la **causa** y el **efecto ejecutado**. Sale directamente de `GET /state/diff` y del `decision_log`.
- **El mensaje acaba en casillas sin marcar.** El sistema pide, no ejecuta. Cada casilla es un `POST /human/approve`.

## 2.2 Briefing de voz (si el mando llama, 40 s)

Registro distinto otra vez: agregado, sin nombres propios de vecinos (no hacen falta y es dato personal de
más), y acabando en una pregunta.

```
"Puesto de mando, sistema de Protección Civil. Situación a las cinco y cincuenta y dos.

 Sesenta y dos personas en la zona. Cuarenta y una localizadas, doce en movimiento, nueve sin localizar.
 Prioridad aérea: Sector 2, Losacio norte. Ocho personas dentro, una con movilidad reducida,
 frente a dieciocho minutos.
 Ha cambiado desde las cinco y cuarenta: el viento ha girado y el Sector 2 sube de tercero a primero.
 Doce rutas recalculadas, nueve confirmadas por teléfono.

 Necesito tres cosas: confirmar la prioridad del Sector 2, aprobar el corte de la N-631 que ha
 reportado un vecino sin verificar, y decidir si abrimos la segunda zona de acogida."
```

Medido en voz alta: **41 segundos**. Nótese: las cifras se dicen con letras en el guion porque el TTS lee
mejor "cinco y cincuenta y dos" que "17:52", y porque en un briefing de voz las horas se dicen en formato de
12 h. **Ninguna cifra la pone el modelo**: todas vienen de `GET /state` y `GET /sectors/air-priority`.

## 2.3 Reglas que van en el prompt del mando

```text
# REGLA CENTRAL
Propones, no despachas. Toda recomendación de medios va con la palabra "propuesta" y con la razón.
Nunca digas "he asignado", "he mandado" ni "he decidido" sobre un medio de emergencia.
Sí puedes decir "he llamado", "he mandado un mensaje" y "he recalculado": eso sí lo has hecho.

# TODO NÚMERO LLEVA SU FUENTE
Cada cifra viene de `GET /state`, `GET /sectors/air-priority` o `GET /queue`. Si un dato no está,
se dice "sin dato", nunca una estimación. En un puesto de mando una cifra inventada se propaga a
decisiones reales en menos de un minuto.

# LO QUE NO SE SABE SE DICE
"Nueve sin localizar" va en la primera frase del resumen, no en un pie de nota.

# DIFERENCIA ENTRE PROPONER Y HABER ACTUADO
Separa siempre en dos bloques: lo que el sistema YA ha ejecutado (llamadas, SMS, recálculos) y lo
que PIDE que se apruebe (medios, cortes de carretera, apertura de zonas).

# NADA DE NOMBRES DE VECINOS EN AGREGADOS
El mando necesita cifras y sectores. Los nombres solo cuando pide una casa concreta.
```

## 2.4 Qué puede salir mal (mando)

| Riesgo | Qué pasa | Mitigación |
|---|---|---|
| **El sistema suena a que despacha medios** | Se cruza la línea del Anexo III.5.d y el jurado lo nota en dos segundos. | "Propuesta" obligatorio + casillas de aprobación + prohibido "he asignado". |
| **Spam de Slack** | 40 mensajes en 10 minutos y el mando deja de leerlos. | Un mensaje por **cambio de ranking** o por decisión pendiente nueva, no por evento. Los eventos van a Sheets y al dashboard. |
| **El agregado esconde la incertidumbre** | El mando decide con 62 personas cuando 9 son un número inventado. | "Sin localizar" en la primera línea, siempre. |
| **Se aprueba por inercia** | Las casillas se marcan sin leer y la supervisión humana es decorativa. | Cada casilla lleva el motivo y el efecto ("12 rutas se recalculan"). Y el dashboard registra `approved_by`, que es lo que hace la supervisión auditable. |
| **Contradicción entre canales** | Slack dice una prioridad y la voz otra. | Los dos leen del mismo `state_version` y lo citan; si no coinciden, es que uno está viejo. |
