delete from official_contact;
delete from source;

insert into source (id, label, rank, is_official, default_validity_min) values
  ('cecopi',          'el puesto de mando',      0, true,   60),
  ('bomberos',        'los bomberos',            1, true,   60),
  ('agente_forestal', 'los agentes forestales',  1, true,   60),
  ('guardia_civil',   'la Guardia Civil',        2, true,   60),
  ('policia_local',   'la Policía Local',        2, true,   60),
  ('112',             'el 112',                  2, true,   45),
  ('patrulla',        'la patrulla',             2, true,   30),
  ('ayuntamiento',    'el Ayuntamiento',         3, true,  120),
  ('sistema',         'nuestro sistema',         4, false, null),
  ('vecino',          'un vecino',               5, false,  20),
  ('desconocido',     'alguien',                 9, false,  10);

insert into official_contact (id, source_id, scope, name, phone_public, listed_public, notes) values
  ('oc-112', '112', 'nacional', 'Emergencias 112', '112', true,
   'Número corto europeo, no E.164.');
