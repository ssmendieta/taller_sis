'use strict';

const { createHash } = require('node:crypto');
const { mkdir, open, readFile } = require('node:fs/promises');
const path = require('node:path');

function canonico(value) {
  if (Array.isArray(value)) return value.map(canonico);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonico(value[key]);
      return result;
    }, {});
  }
  return value;
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(canonico(value))).digest('hex');
}

class StateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.inbox = new Map();
    this.pending = new Map();
  }

  async load() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    let content = '';
    try {
      content = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    for (const line of content.split('\n').filter(Boolean)) {
      const record = JSON.parse(line);
      if (record.type === 'RECEIVED') {
        this.inbox.set(record.requestEventId, record);
        this.pending.set(record.response.eventId, record.response);
      } else if (record.type === 'SENT') {
        this.pending.delete(record.responseEventId);
      }
    }
  }

  async receive(request, response) {
    const previo = this.inbox.get(request.eventId);
    const payloadHash = hash(request);
    if (previo) {
      if (previo.payloadHash !== payloadHash) throw new Error(`eventId ${request.eventId} repetido con contenido diferente`);
      return { isNew: false, response: previo.response };
    }
    const record = { type: 'RECEIVED', requestEventId: request.eventId, payloadHash, response };
    await this.append(record);
    this.inbox.set(request.eventId, record);
    this.pending.set(response.eventId, response);
    return { isNew: true, response };
  }

  async markSent(responseEventId, messageId) {
    if (!this.pending.has(responseEventId)) return;
    await this.append({ type: 'SENT', responseEventId, messageId, sentAt: new Date().toISOString() });
    this.pending.delete(responseEventId);
  }

  async append(record) {
    const handle = await open(this.filePath, 'a');
    try {
      await handle.write(`${JSON.stringify(record)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}

module.exports = { StateStore, hash };
