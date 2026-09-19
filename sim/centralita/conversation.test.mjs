import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withTimeout, runConversation } from './conversation.mjs';

test('una operación sin respuesta tiene un límite real', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 15, 'ack'), /ack/);
});

test('un ACK y un cierre colgados no retienen la plaza de conversación', async () => {
  let closed = 0;
  const client = { chat: { createToken: async () => ({ token: 'test' }) } };
  const openChat = (_token, label) => ({
    session_id: label, closed: null,
    connect: async () => {}, waitAgent: async () => 'Mensaje de prueba',
    conn: { sendMessage: () => new Promise(() => {}), endSession: () => new Promise(() => {}), close: () => { closed++; } },
  });
  const start = Date.now();
  await assert.rejects(runConversation(client, {}, {}, { env: {}, openChat, deadlineMs: 30, cleanupMs: 10 }), /Tiempo|timeout|límite/i);
  assert.ok(Date.now() - start < 1000);
  assert.equal(closed, 2);
});
