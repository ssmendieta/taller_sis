'use strict';

const { createHash } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

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
  constructor(dbPath) {
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') {
      mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS inbox (
        request_event_id TEXT PRIMARY KEY,
        correlation_id TEXT NOT NULL,
        solicitud_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        raw_request TEXT NOT NULL,
        received_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS responses (
        response_event_id TEXT PRIMARY KEY,
        request_event_id TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        solicitud_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('PENDING', 'SENT')),
        raw_response TEXT NOT NULL,
        message_id TEXT,
        created_at TEXT NOT NULL,
        sent_at TEXT,
        FOREIGN KEY (request_event_id) REFERENCES inbox(request_event_id)
      );

      CREATE INDEX IF NOT EXISTS ix_responses_status ON responses (status);
      CREATE INDEX IF NOT EXISTS ix_responses_request ON responses (request_event_id);
    `);

    this.stmtGetInbox = this.db.prepare('SELECT * FROM inbox WHERE request_event_id = ?');
    this.stmtGetResponseByRequest = this.db.prepare('SELECT * FROM responses WHERE request_event_id = ?');
    this.stmtInsertInbox = this.db.prepare(`
      INSERT INTO inbox (request_event_id, correlation_id, solicitud_id, payload_hash, raw_request, received_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    this.stmtInsertResponse = this.db.prepare(`
      INSERT INTO responses (response_event_id, request_event_id, correlation_id, solicitud_id, status, raw_response, message_id, created_at, sent_at)
      VALUES (?, ?, ?, ?, 'PENDING', ?, NULL, ?, NULL)
    `);
    this.stmtGetPending = this.db.prepare("SELECT * FROM responses WHERE status = 'PENDING' ORDER BY created_at ASC");
    this.stmtMarkSent = this.db.prepare("UPDATE responses SET status = 'SENT', message_id = ?, sent_at = ? WHERE response_event_id = ?");
    this.stmtIsPending = this.db.prepare("SELECT 1 FROM responses WHERE response_event_id = ? AND status = 'PENDING'");
  }

  receive(request, response) {
    const payloadHash = hash(request);
    const existingInbox = this.stmtGetInbox.get(request.eventId);

    if (existingInbox) {
      if (existingInbox.payload_hash !== payloadHash) {
        throw new Error(`eventId ${request.eventId} repetido con contenido diferente`);
      }
      const existingResponseRow = this.stmtGetResponseByRequest.get(request.eventId);
      if (!existingResponseRow) {
        throw new Error(`Inconsistencia interna: respuesta ausente para request_event_id ${request.eventId}`);
      }
      return {
        isNew: false,
        response: JSON.parse(existingResponseRow.raw_response),
      };
    }

    const now = new Date().toISOString();

    // Transaccion atomica: se persiste la solicitud en el inbox y la respuesta en responses
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.stmtInsertInbox.run(
        request.eventId,
        request.correlationId,
        request.data.solicitudId ?? request.data.consultaId,
        payloadHash,
        JSON.stringify(request),
        now,
      );

      this.stmtInsertResponse.run(
        response.eventId,
        request.eventId,
        response.correlationId,
        response.data.solicitudId ?? response.data.consultaId,
        JSON.stringify(response),
        now,
      );

      this.db.exec('COMMIT;');
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }

    return {
      isNew: true,
      response,
    };
  }

  getPendingResponses() {
    const rows = this.stmtGetPending.all();
    return rows.map((row) => ({
      ...JSON.parse(row.raw_response),
      _dbRow: {
        responseEventId: row.response_event_id,
        requestEventId: row.request_event_id,
        status: row.status,
      },
    }));
  }

  isPending(responseEventId) {
    return Boolean(this.stmtIsPending.get(responseEventId));
  }

  markSent(responseEventId, messageId) {
    const now = new Date().toISOString();
    this.stmtMarkSent.run(messageId, now, responseEventId);
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = {
  StateStore,
  canonico,
  hash,
};
