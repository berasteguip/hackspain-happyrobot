drop table if exists call_log cascade;

create table call_log (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  topic         text        not null default 'other',
  locality_id   text        references locality(id),
  road          text,
  place_text    text,
  person_id     text        references person(id),
  phone         text,
  source_id     text        not null default 'desconocido' references source(id),
  source_detail text,
  question      text        not null,
  answer        text,
  validity_min  int4,
  callback_to   text        references source(id),
  callback_at   timestamptz,
  run_id        text,
  simulated     bool        not null default true
);

create index call_log_hot_idx    on call_log (topic, locality_id, created_at desc);
create index call_log_road_idx   on call_log (topic, road, created_at desc) where road is not null;
create index call_log_open_idx   on call_log (created_at desc) where answer is null;
create index call_log_person_idx on call_log (person_id, created_at desc);
create index call_log_recent_idx on call_log (created_at desc);
