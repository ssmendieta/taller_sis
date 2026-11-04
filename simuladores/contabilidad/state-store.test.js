'use strict';

const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { StateStore } = require('./state-store');

test('deduplica y recupera la respuesta pendiente tras reiniciar', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'contabilidad-simulator-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.jsonl');
  const request = { eventId: 'request-1', value: 1 };
  const response = { eventId: 'response-1', data: { requestEventId: 'request-1' } };
  const first = new StateStore(file);
  await first.load();
  assert.deepEqual(await first.receive(request, response), { isNew: true, response });

  const restarted = new StateStore(file);
  await restarted.load();
  assert.deepEqual(await restarted.receive(request, { eventId: 'response-otra' }), { isNew: false, response });
  assert.equal(restarted.inbox.size, 1);
  assert.equal(restarted.pending.size, 1);
  await restarted.markSent('response-1', 'message-1');

  const completed = new StateStore(file);
  await completed.load();
  assert.equal(completed.inbox.size, 1);
  assert.equal(completed.pending.size, 0);
});
