import { loadOutboxConfig } from './outbox.config';

describe('Configuración del publicador outbox', () => {
  it('solo activa el worker cuando Pub/Sub está habilitado', () => {
    expect(loadOutboxConfig({ PUBSUB_ENABLED: 'false' })).toMatchObject({
      enabled: false,
      batchSize: 20,
      pollIntervalMs: 5000,
      leaseMs: 30000,
      retryBaseMs: 5000,
      retryMaxMs: 300000,
    });
    expect(loadOutboxConfig({ PUBSUB_ENABLED: 'true' }).enabled).toBe(true);
  });

  it('rechaza intervalos inválidos y un tope menor que la espera inicial', () => {
    expect(() => loadOutboxConfig({
      PUBSUB_ENABLED: 'true',
      OUTBOX_BATCH_SIZE: '0',
    })).toThrow('OUTBOX_BATCH_SIZE');
    expect(() => loadOutboxConfig({
      PUBSUB_ENABLED: 'true',
      OUTBOX_RETRY_BASE_MS: '2000',
      OUTBOX_RETRY_MAX_MS: '1000',
    })).toThrow('OUTBOX_RETRY_MAX_MS');
  });
});
