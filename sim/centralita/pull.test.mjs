import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchOutcomeForSession, normalize } from './pull.mjs';

const trigger = { node_persistent_id: '01a0b937-7c15-75b5-a144-8d7c0a5380b0', output_id: 'trigger' };
const extract = { node_persistent_id: '01a0b93b-0f3e-7229-b4a0-8f8b2c28b5c7', output_id: 'extract', status: 'succeeded' };

test('el pull refresca nodos mientras la extracción está pendiente aunque el webhook falle', async () => {
  let polls = 0;
  const client = {
    workflows: { listRuns: async () => [{ id: 'run-1', status: 'failed' }] },
    runs: {
      listNodes: async () => ++polls < 3 ? [trigger] : [trigger, extract],
      getOutput: async (_run, id) => ({ data: { data: id === 'trigger' ? { text_session_id: 'session-1', person_id: 'person-1' } : { response: { answered: 'true', consent_position: 'true', will_evacuate: 'false' } } } }),
    },
  };
  const result = await fetchOutcomeForSession(client, 'workflow', 'session-1', 'person-1', { timeoutMs: 200, intervalMs: 1, sinceMs: Date.now() });
  assert.ok(polls >= 3);
  assert.equal(result.run_id, 'run-1');
  assert.equal(result.answered, true);
  assert.equal(result.extracted.consent_position, true);
  assert.equal(result.extracted.will_evacuate, false);
});

test('una sesión distinta no se empareja por coincidir person_id', async () => {
  const client = {
    workflows: { listRuns: async () => [{ id: 'old-run' }] },
    runs: {
      listNodes: async () => [trigger, extract],
      getOutput: async () => ({ data: { data: { text_session_id: 'old-session', person_id: 'person-1' } } }),
    },
  };
  const result = await fetchOutcomeForSession(client, 'workflow', 'new-session', 'person-1', { timeoutMs: 20, intervalMs: 1 });
  assert.equal(result.extracted, null);
  assert.equal(result.run_id, null);
});

test('normaliza listas serializadas por Extract sin perder vulnerabilidades', () => {
  assert.deepEqual(normalize({ vulnerable_people: '[{"description":"madre","needs":"traslado"}]', neighbors_mentioned: '[]' }), { vulnerable_people: [{ description: 'madre', needs: 'traslado' }], neighbors_mentioned: [] });
  assert.equal(normalize('[texto incompleto'), '[texto incompleto');
});

test('normaliza booleanos y null sin convertir ausencia en consentimiento', () => {
  assert.deepEqual(normalize({ consent_position: 'null', answered: 'false', vulnerable_people: [{ description: 'persona' }] }), { consent_position: null, answered: false, vulnerable_people: [{ description: 'persona' }] });
});
