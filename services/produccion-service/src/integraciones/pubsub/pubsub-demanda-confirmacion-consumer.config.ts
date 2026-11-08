export const PUBSUB_DEMANDA_CONFIRMACION_CONSUMER_CONFIG = Symbol(
  'PUBSUB_DEMANDA_CONFIRMACION_CONSUMER_CONFIG',
);

export interface PubSubDemandaConfirmacionConsumerConfig {
  enabled: boolean;
  projectId: string;
  subscriptionId: string;
  retryMaxAttempts: number;
  retryIntervalMs: number;
}

function habilitado(value: string | undefined): boolean {
  const normalized = (value ?? 'false').trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no', ''].includes(normalized)) return false;
  throw new Error(`PUBSUB_DEMANDA_CONFIRMACION_CONSUMER_ENABLED debe ser true o false; se recibio "${value}"`);
}

function entero(value: string | undefined, defecto: number, variable: string, minimo: number): number {
  if (value === undefined || value.trim() === '') return defecto;
  const numero = Number(value);
  if (!Number.isInteger(numero) || numero < minimo) {
    throw new Error(`${variable} debe ser un entero mayor o igual a ${minimo}`);
  }
  return numero;
}

function normalizar(value: string, projectId: string): string {
  if (!value.startsWith('projects/')) return value;
  const match = /^projects\/([^/]+)\/subscriptions\/([^/]+)$/.exec(value);
  if (!match) {
    throw new Error('PUBSUB_DEMANDA_CONFIRMACION_SUBSCRIPTION_ID debe ser un ID o projects/{project}/subscriptions/{id}');
  }
  if (match[1] !== projectId) {
    throw new Error('El proyecto de PUBSUB_DEMANDA_CONFIRMACION_SUBSCRIPTION_ID no coincide con GCP_PROJECT_ID');
  }
  return match[2];
}

export function loadPubSubDemandaConfirmacionConsumerConfig(
  env: NodeJS.ProcessEnv = process.env,
): PubSubDemandaConfirmacionConsumerConfig {
  const enabled = habilitado(env.PUBSUB_DEMANDA_CONFIRMACION_CONSUMER_ENABLED);
  const projectId = env.GCP_PROJECT_ID?.trim() ?? '';
  const subscription = env.PUBSUB_DEMANDA_CONFIRMACION_SUBSCRIPTION_ID?.trim() ?? '';
  const retryMaxAttempts = entero(
    env.PUBSUB_DEMANDA_CONFIRMACION_RETRY_MAX_ATTEMPTS,
    5,
    'PUBSUB_DEMANDA_CONFIRMACION_RETRY_MAX_ATTEMPTS',
    1,
  );
  const retryIntervalMs = entero(
    env.PUBSUB_DEMANDA_CONFIRMACION_RETRY_INTERVAL_MS,
    5000,
    'PUBSUB_DEMANDA_CONFIRMACION_RETRY_INTERVAL_MS',
    100,
  );
  if (!enabled) return { enabled, projectId, subscriptionId: subscription, retryMaxAttempts, retryIntervalMs };
  if (!projectId) throw new Error('GCP_PROJECT_ID es obligatorio cuando el consumidor de confirmaciones esta habilitado');
  if (!subscription) {
    throw new Error('PUBSUB_DEMANDA_CONFIRMACION_SUBSCRIPTION_ID es obligatorio cuando el consumidor de confirmaciones esta habilitado');
  }
  return {
    enabled,
    projectId,
    subscriptionId: normalizar(subscription, projectId),
    retryMaxAttempts,
    retryIntervalMs,
  };
}
