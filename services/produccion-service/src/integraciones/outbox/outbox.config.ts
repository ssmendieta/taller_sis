export const OUTBOX_CONFIG = Symbol('OUTBOX_CONFIG');

export interface OutboxConfig {
  enabled: boolean;
  batchSize: number;
  pollIntervalMs: number;
  leaseMs: number;
  retryBaseMs: number;
  retryMaxMs: number;
}

function leerEnteroPositivo(
  env: NodeJS.ProcessEnv,
  nombre: string,
  porDefecto: number,
): number {
  const texto = env[nombre]?.trim();
  if (!texto) return porDefecto;
  const valor = Number(texto);
  if (!Number.isSafeInteger(valor) || valor < 1) {
    throw new Error(`${nombre} debe ser un entero positivo`);
  }
  return valor;
}

export function loadOutboxConfig(
  env: NodeJS.ProcessEnv = process.env,
): OutboxConfig {
  const enabled = ['true', '1', 'yes'].includes(
    (env.PUBSUB_ENABLED ?? 'false').trim().toLowerCase(),
  );
  const retryBaseMs = leerEnteroPositivo(env, 'OUTBOX_RETRY_BASE_MS', 5000);
  const retryMaxMs = leerEnteroPositivo(env, 'OUTBOX_RETRY_MAX_MS', 300000);
  if (retryMaxMs < retryBaseMs) {
    throw new Error('OUTBOX_RETRY_MAX_MS no puede ser menor que OUTBOX_RETRY_BASE_MS');
  }

  return {
    enabled,
    batchSize: leerEnteroPositivo(env, 'OUTBOX_BATCH_SIZE', 20),
    pollIntervalMs: leerEnteroPositivo(env, 'OUTBOX_POLL_INTERVAL_MS', 5000),
    leaseMs: leerEnteroPositivo(env, 'OUTBOX_LEASE_MS', 30000),
    retryBaseMs,
    retryMaxMs,
  };
}
