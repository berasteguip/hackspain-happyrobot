-- ============================================================================
-- Twin (HappyRobot) · El padrón del escenario
-- ----------------------------------------------------------------------------
-- Regla que decide qué vive aquí y qué no:
--   ¿el dato cambia DURANTE el incendio?
--     no  -> Twin (esta base). Es padrón: quién vive dónde, y dónde está ese dónde.
--     sí  -> api/ (estado de crisis). Es la única fuente de verdad en runtime.
-- Por eso aquí NO hay status, call_attempts, priority_score, minutes_to_front,
-- assigned_route ni occupancy. Ver docs/07-decisiones/005-padron-en-twin-estado-en-api.md
--
-- Jerarquía (la administrativa real española, sin inventar niveles):
--   municipality -> locality -> house -> person
-- Y una sola cosa operativa cruzándola: sector (polígono del incidente).
--
-- Nombres en inglés (AGENTS.md §4) y alineados con las entidades del contrato:
-- house.id == House.id ('h-001'), person.id == Person.id ('p-001').
-- Docs: docs/06-producto/12-tablas-basicas-twin.md
-- Semilla: python data/twin_seed.py  ->  data/twin/seed.sql
-- ============================================================================

drop view  if exists v_person_support   cascade;
drop view  if exists v_person_location  cascade;
drop table if exists support_need        cascade;
drop table if exists person              cascade;
drop table if exists house               cascade;
drop table if exists sector              cascade;
drop table if exists locality            cascade;
drop table if exists municipality        cascade;

-- ---------------------------------------------------------------------------
-- 1. municipality — el municipio. Tiene ayuntamiento, y su alcalde es por ley
--    la autoridad local de protección civil (director del PEMU). Es el nivel
--    al que se escala, no un adorno geográfico.
-- ---------------------------------------------------------------------------
create table municipality (
  id              text primary key,              -- 'm-losacio'
  name            text not null,
  ine_code        text,                          -- NULL = [SIN VERIFICAR], no lo inventamos
  province        text not null,
  region          text not null,                 -- comunidad autónoma
  comarca         text,
  population      int4,
  population_year int4,
  lat             float8 not null,
  lon             float8 not null
);

-- ---------------------------------------------------------------------------
-- 2. locality — el núcleo de población: lo que el vecino dice por teléfono.
--    Nadie dice "estoy en el municipio de Ferreruela de Tábara": dice
--    "estoy en Sesnández". Sesnández es pedanía de Ferreruela, y sin este
--    nivel esa frase no se puede resolver contra nada.
-- ---------------------------------------------------------------------------
create table locality (
  id              text primary key,              -- 'n-sesnandez-de-tabara'
  municipality_id text not null references municipality(id),
  name            text not null,
  kind            text not null,                 -- 'capital' | 'pedania'
  population      int4,
  population_year int4,
  lat             float8 not null,
  lon             float8 not null
);
create index locality_municipality_idx on locality (municipality_id);

-- ---------------------------------------------------------------------------
-- 3. sector — la única tabla operativa del padrón, y la excepción consciente
--    a la regla de arriba: los sectores se dibujan PARA un incidente, no
--    existen antes de él. Se reescriben enteros al cargar un escenario.
--    Los contadores (people_inside, air_priority_rank) NO están aquí: cambian
--    cada minuto y viven en api/.
-- ---------------------------------------------------------------------------
create table sector (
  id       text primary key,                     -- 's-2'
  incident text not null,                        -- 'sierra-culebra'
  name     text not null,
  polygon  jsonb not null                        -- GeoJSON Polygon, orden [lon, lat]
);

-- ---------------------------------------------------------------------------
-- 4. house — el domicilio. Es la unidad que la patrulla visita, y por eso
--    existe aunque no se le conozca ningún residente: una casa sin persona
--    asociada no es un hueco en los datos, es exactamente la casa a la que
--    hay que mandar a alguien.
-- ---------------------------------------------------------------------------
create table house (
  id                 text primary key,           -- 'h-001' == House.id del contrato
  locality_id        text not null references locality(id),
  sector_id          text references sector(id),
  street             text not null,              -- 'Calle Mayor' | 'Diseminado'
  number             text,                       -- NULL en diseminado: no hay número, no es el 0
  address            text not null,              -- la dirección tal y como se dice en voz alta
  lat                float8 not null,
  lon                float8 not null,
  landline           text,                       -- NULL si la casa no tiene fijo
  residents_expected int4,
  second_home        bool not null default false,
  dispersed          bool not null default false, -- fuera del casco urbano
  source             text not null default 'padron' -- 'padron' | 'call'
);
create index house_locality_idx on house (locality_id);
create index house_sector_idx   on house (sector_id);

-- ---------------------------------------------------------------------------
-- 5. person — la persona (o el núcleo familiar que representa).
--    `phone` es único a propósito: es la llave por la que una llamada entrante
--    se resuelve a una persona en una consulta, sin joins y sin pensar.
--    `source` dice quién sabe que esta persona existe: 'padron' si estaba en el
--    censo, 'call' si apareció porque un vecino la mencionó por teléfono. El
--    padrón de un pueblo de 90 habitantes en agosto está mal a propósito, y esta
--    columna es la que deja verlo en vez de taparlo.
-- ---------------------------------------------------------------------------
create table person (
  id             text primary key,               -- 'p-001' == Person.id del contrato
  house_id       text not null references house(id),
  name           text not null,
  phone          text not null,                  -- E.164, rango reservado +3460099xxxx
  household_size int4 not null default 1,
  has_vehicle    bool not null default false,
  has_smartphone bool not null default false,
  age            int4,
  source         text not null default 'padron' -- 'padron' | 'call', ver §5 del doc
);
create unique index person_phone_idx on person (phone);
create index        person_house_idx on person (house_id);

-- ---------------------------------------------------------------------------
-- 6. support_need — quién no sale solo de casa.
--    Tabla aparte, y no una columna de person, porque esto es probablemente
--    dato de salud (RGPD art. 9, categoría especial). Separarlo permite dar
--    acceso a `person` sin dar acceso a esto, y hace imposible que se cuele
--    por accidente en la consulta que el agente de voz hace en caliente.
--    Ausencia de fila = la persona se vale por sí misma.
-- ---------------------------------------------------------------------------
create table support_need (
  person_id text primary key references person(id),
  mobility  text,                                -- 'reduced' | 'immobile' | NULL si el motivo no es de movilidad
  reason    text not null
);

-- ---------------------------------------------------------------------------
-- 7. Vistas. Dos, y la frontera entre ellas es la frontera de privacidad.
-- ---------------------------------------------------------------------------

-- v_person_location: SIN dato de salud. Es la que lee el agente de voz en
-- mitad de una llamada: un SELECT por `phone` con índice único, cero joins
-- escritos a mano, y nada que no pueda salir por un altavoz.
create view v_person_location as
select p.id              as person_id,
       p.name,
       p.phone,
       p.household_size,
       p.has_smartphone,
       p.has_vehicle,
       p.source,
       h.id              as house_id,
       h.address,
       h.lat,
       h.lon,
       h.landline,
       h.sector_id,
       l.id              as locality_id,
       l.name            as locality,
       m.id              as municipality_id,
       m.name            as municipality,
       m.province
from       person       p
join       house        h on h.id = p.house_id
join       locality     l on l.id = h.locality_id
join       municipality m on m.id = l.municipality_id;

-- v_person_support: CON dato de salud. Para api/ y el puesto de mando, no
-- para el agente. Reconstruye el enum `mobility` del contrato a partir de las
-- dos cosas distintas que ese enum mezcla: tener coche y poder andar.
create view v_person_support as
select v.*,
       coalesce(s.mobility, case when v.has_vehicle then 'car' else 'walking' end) as mobility,
       (s.person_id is not null) as needs_support,
       s.reason                  as support_reason
from v_person_location v
left join support_need s on s.person_id = v.person_id;

-- ---------------------------------------------------------------------------
-- 8. source — el vocabulario de QUIÉN afirma algo.
--    Tabla y no enum porque lleva tres cosas que una lista de strings no da:
--    `label` es lo que el agente PRONUNCIA al citar («los bomberos»), de modo
--    que la cita no la improvise el modelo; `rank` resuelve contradicciones sin
--    un CASE repetido en cada consulta (menor gana); y `default_validity_min`
--    fija cuánto dura fiable un dato según quién lo dice, en vez de pedirle al
--    modelo un número inventado en cada llamada.
--    Es el MISMO vocabulario que usa `official_contact.source_id`: la llave que
--    dice quién afirma algo es la que dice a quién se le pregunta.
-- ---------------------------------------------------------------------------
create table source (
  id                   text primary key,     -- 'bomberos'
  label                text not null,        -- 'los bomberos'
  rank                 int4 not null,        -- menor = gana ante contradicción
  is_official          bool not null,        -- cambia cómo lo dice el agente
  default_validity_min int4                  -- NULL = no caduca
);

-- ---------------------------------------------------------------------------
-- 9. official_contact — a quién se puede llamar, y sobre todo a quién NO.
--
--    DOS COLUMNAS DE TELÉFONO, y la diferencia es de seguridad, no de formato:
--      · phone_public  el número real y publicado del organismo. El agente lo
--                      DICE en voz alta para que lo marque el vecino. Nunca lo
--                      marca el sistema.
--      · phone_sim     un número del rango reservado. Es lo ÚNICO marcable, y
--                      la CHECK de abajo hace imposible meter ahí un número de
--                      verdad. No es disciplina: la base lo rechaza.
--
--    `name` es el ORGANISMO, nunca una persona: «Cuartel de la Guardia Civil de
--    Tábara», no el móvil del sargento. `listed_public` es la afirmación
--    explícita de que ese número está publicado, y sin ella la fila no entra.
-- ---------------------------------------------------------------------------
create table official_contact (
  id              text primary key,
  source_id       text not null references source(id),
  scope           text not null,              -- nacional | autonomico | municipal | local
  municipality_id text references municipality(id),
  locality_id     text references locality(id),
  name            text not null,
  phone_public    text,                       -- sin formato E.164 forzado: '112' es válido
  phone_sim       text,
  listed_public   bool not null default true,
  notes           text,
  constraint phone_sim_reservado
    check (phone_sim is null or phone_sim like '+3460099%')
);
create index official_contact_muni_idx     on official_contact (source_id, municipality_id);
create index official_contact_locality_idx on official_contact (source_id, locality_id);

-- v_contact_lookup: lo que devuelve `buscar_contacto`. NO expone `phone_sim`;
-- solo dice si el sistema puede marcar (`dialable`) o si únicamente puede dar
-- el número para que lo marque la persona.
create view v_contact_lookup as
select oc.id,
       oc.source_id,
       s.label                      as source_label,
       oc.name,
       oc.phone_public,
       (oc.phone_sim is not null)   as dialable,
       oc.scope,
       oc.municipality_id,
       oc.locality_id
from official_contact oc
join source s on s.id = oc.source_id;
