drop view  if exists v_contact_lookup   cascade;
drop view  if exists v_person_support   cascade;
drop view  if exists v_person_location  cascade;
drop table if exists official_contact   cascade;
drop table if exists source             cascade;
drop table if exists support_need       cascade;
drop table if exists person             cascade;
drop table if exists house              cascade;
drop table if exists sector             cascade;
drop table if exists locality           cascade;
drop table if exists municipality       cascade;

create table municipality (
  id              text primary key,
  name            text not null,
  ine_code        text,
  province        text not null,
  region          text not null,
  comarca         text,
  population      int4,
  population_year int4,
  lat             float8 not null,
  lon             float8 not null
);

create table locality (
  id              text primary key,
  municipality_id text not null references municipality(id),
  name            text not null,
  kind            text not null,
  population      int4,
  population_year int4,
  lat             float8 not null,
  lon             float8 not null
);
create index locality_municipality_idx on locality (municipality_id);

create table sector (
  id       text primary key,
  incident text not null,
  name     text not null,
  polygon  jsonb not null
);

create table house (
  id                 text primary key,
  locality_id        text not null references locality(id),
  sector_id          text references sector(id),
  street             text not null,
  number             text,
  address            text not null,
  lat                float8 not null,
  lon                float8 not null,
  landline           text,
  residents_expected int4,
  second_home        bool not null default false,
  dispersed          bool not null default false,
  source             text not null default 'padron'
);
create index house_locality_idx on house (locality_id);
create index house_sector_idx   on house (sector_id);

create table person (
  id             text primary key,
  house_id       text not null references house(id),
  name           text not null,
  phone          text not null,
  household_size int4 not null default 1,
  has_vehicle    bool not null default false,
  has_smartphone bool not null default false,
  age            int4,
  source         text not null default 'padron'
);
create unique index person_phone_idx on person (phone);
create index        person_house_idx on person (house_id);

create table support_need (
  person_id text primary key references person(id),
  mobility  text,
  reason    text not null
);

create table source (
  id                   text primary key,
  label                text not null,
  rank                 int4 not null,
  is_official          bool not null,
  default_validity_min int4
);

create table official_contact (
  id              text primary key,
  source_id       text not null references source(id),
  scope           text not null,
  municipality_id text references municipality(id),
  locality_id     text references locality(id),
  name            text not null,
  phone_public    text,
  phone_sim       text,
  listed_public   bool not null default true,
  notes           text,
  constraint phone_sim_reservado
    check (phone_sim is null or phone_sim like '+3460099%')
);
create index official_contact_muni_idx     on official_contact (source_id, municipality_id);
create index official_contact_locality_idx on official_contact (source_id, locality_id);

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

create view v_person_support as
select v.*,
       coalesce(s.mobility, case when v.has_vehicle then 'car' else 'walking' end) as mobility,
       (s.person_id is not null) as needs_support,
       s.reason                  as support_reason
from v_person_location v
left join support_need s on s.person_id = v.person_id;

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
