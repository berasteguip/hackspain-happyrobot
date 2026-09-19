-- ============================================================================
-- Twin · call_log — la memoria compartida entre las 300 instancias del agente
-- ----------------------------------------------------------------------------
-- Una fila NO es «esto pasó en la llamada X»: es **una afirmación**, o sea qué
-- se sabe sobre un tema, quién lo dice y hasta cuándo es fiable. Por eso la
-- respuesta vive en la misma fila que la pregunta y no en otra: «¿alguien
-- preguntó esto?» y «¿hay respuesta?» tienen que ser una sola lectura.
--
-- No confundir con el `decision_log` del contrato (§2.6): aquel registra
-- decisiones del sistema y vive en `api/`. Esto es conocimiento dicho por
-- personas, vive aquí, y lo consulta el agente en mitad de una conversación.
--
-- Requiere data/twin/schema.sql (locality, person, source) cargado antes.
-- Porqué de cada columna: docs/06-producto/12-tablas-basicas-twin.md §6.
-- ============================================================================

drop table if exists call_log cascade;

create table call_log (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  -- DE QUÉ habla. Lo único que hace la consulta indexable: buscar
  -- «¿está cortada la ZA-P-2551?» por texto no funciona porque nadie repite la
  -- misma frase; `topic='road_status' and road='ZA-P-2551'` es igualdad.
  topic         text        not null default 'other',
  locality_id   text        references locality(id),   -- cuando el sitio está en el padrón
  road          text,                                   -- 'ZA-P-2434'
  place_text    text,                                   -- paraje sin entidad: 'la pista de La Cernada'

  -- QUIÉN habla. `person_id` puede ser nulo: quien llama puede no estar en el
  -- padrón, y eso mismo es la señal de que hay un vecino nuevo que registrar.
  person_id     text        references person(id),
  phone         text,
  source_id     text        not null default 'desconocido' references source(id),
  source_detail text,                                   -- la unidad concreta: 'bomberos de Zamora'

  -- QUÉ se dijo. `answer` nulo = pendiente; no hace falta un tipo aparte.
  question      text        not null,
  answer        text,
  answered_at   timestamptz,
  valid_until   timestamptz,                            -- NULL = no caduca

  -- Bucle abierto: «a las tres me dicen algo», como dato consultable y no
  -- enterrado en texto.
  callback_to   text        references source(id),
  callback_at   timestamptz,

  run_id        text,                                   -- salta a la grabación
  answer_run_id text,                                   -- la llamada que trajo la respuesta
  simulated     bool        not null default true       -- se declara, no se esconde
);

-- La consulta en caliente: por tema + zona, o por tema + carretera.
create index call_log_hot_idx    on call_log (topic, locality_id, created_at desc);
create index call_log_road_idx   on call_log (topic, road, created_at desc) where road is not null;
-- La cola de lo que hay que volver a preguntar.
create index call_log_open_idx   on call_log (callback_at) where answer is null;
create index call_log_person_idx on call_log (person_id, created_at desc);
create index call_log_recent_idx on call_log (created_at desc);

-- ---------------------------------------------------------------------------
-- La lectura que hace el agente. Ensancha en vez de devolver vacío, que es lo
-- que hace un humano: primero su núcleo, luego su municipio, luego la carretera
-- por la que va. Eso solo es posible porque el padrón tiene la jerarquía.
--
--   select l.name as zona, c.question, c.answer, s.label as fuente,
--          extract(epoch from (now() - c.created_at))/60 as hace_min
--   from call_log c
--   join source s on s.id = c.source_id
--   left join locality l on l.id = c.locality_id
--   where c.answer is not null
--     and (c.valid_until is null or c.valid_until > now())
--     and (c.locality_id = $1 or c.road = $2)
--   order by s.rank, c.created_at desc
--   limit 5;
--
-- `order by s.rank` es lo que resuelve las contradicciones: si un vecino y los
-- bomberos dicen lo contrario de la misma carretera, gana el de mejor rank.
-- `hace_min` va en la consulta porque el agente está OBLIGADO a citar fuente y
-- antigüedad: «hace veinte minutos los bomberos nos dijeron que…».
-- ---------------------------------------------------------------------------
