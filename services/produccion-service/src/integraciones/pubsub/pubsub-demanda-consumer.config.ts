export const PUBSUB_DEMANDA_CONSUMER_CONFIG = Symbol('PUBSUB_DEMANDA_CONSUMER_CONFIG');

export interface PubSubDemandaConsumerConfig {
  enabled: boolean;
  projectId: string;
  subscriptionId: string;
}

function habilitado(value: string | undefined): boolean {
  const normalized = (value ?? 'false').trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no', ''].includes(normalized)) return false;
  throw new Error(`PUBSUB_DEMANDA_CONSUMER_ENABLED debe ser true o false; se recibio "${value}"`);
}

function normalizar(value: string, projectId: string): string {
  if (!value.startsWith('projects/')) return value;
  const match = /^projects\/([^/]+)\/subscriptions\/([^/]+)$/.exec(value);
  if (!match) throw new Error('PUBSUB_DEMANDA_SUBSCRIPTION_ID debe ser un ID o projects/{project}/subscriptions/{id}');
  if (match[1] !== projectId) throw new Error('El proyecto de PUBSUB_DEMANDA_SUBSCRIPTION_ID no coincide con GCP_PROJECT_ID');
  return match[2];
}

// ABC-356: el consumidor de demandas se activa con su propio flag.
export function loadPubSubDemandaConsumerConfig(
  env: NodeJS.ProcessEnv = process.env,
): PubSubDemandaConsumerConfig {
  const enabled = habilitado(env.PUBSUB_DEMANDA_CONSUMER_ENABLED);
  const projectId = env.GCP_PROJECT_ID?.trim() ?? '';
  const subscription = env.PUBSUB_DEMANDA_SUBSCRIPTION_ID?.trim() ?? '';
  if (!enabled) return { enabled, projectId, subscriptionId: subscription };
  if (!projectId) throw new Error('GCP_PROJECT_ID es obligatorio cuando el consumidor de demandas esta habilitado');
  if (!subscription) throw new Error('PUBSUB_DEMANDA_SUBSCRIPTION_ID es obligatorio cuando el consumidor de demandas esta habilitado');
  return { enabled, projectId, subscriptionId: normalizar(subscription, projectId) };
}
