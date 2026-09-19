-- ============================================================================
-- Vocabulario y contactos. A MANO, no generado: no sale del escenario sintético.
-- Cargar después de data/twin/schema.sql.
-- ============================================================================

delete from official_contact;
delete from source;

-- El vocabulario compartido entre "quién afirma esto" (call_log.source_id) y
-- "a quién se le pregunta" (official_contact.source_id). Propuesta de partida:
-- si la base de contactos que se descargue trae otros tipos, se INSERTAN aquí
-- (es aditivo, no rompe nada).
insert into source (id, label, rank, is_official, default_validity_min) values
  ('cecopi',          'el puesto de mando',      0, true,   60),
  ('bomberos',        'los bomberos',            1, true,   60),
  ('agente_forestal', 'los agentes forestales',  1, true,   60),  -- [SIN VERIFICAR] quién dirige la extinción en CyL
  ('guardia_civil',   'la Guardia Civil',        2, true,   60),
  ('policia_local',   'la Policía Local',        2, true,   60),
  ('112',             'el 112',                  2, true,   45),
  ('patrulla',        'la patrulla',             2, true,   30),
  ('ayuntamiento',    'el Ayuntamiento',         3, true,  120),
  ('sistema',         'nuestro sistema',         4, false, null),
  ('vecino',          'un vecino',               5, false,  20),
  ('desconocido',     'alguien',                 9, false,  10);

-- Contactos: VACÍO a propósito salvo el 112.
-- Los números reales llegan de la base que se está descargando aparte. Van a
-- `phone_public` (el agente los dice, nadie los marca) y `phone_sim` se queda
-- NULL mientras no exista una contraparte simulada para ese organismo.
insert into official_contact (id, source_id, scope, name, phone_public, listed_public, notes) values
  ('oc-112', '112', 'nacional', 'Emergencias 112', '112', true,
   'Número corto europeo. No es E.164 a propósito: los códigos cortos no lo son.');
