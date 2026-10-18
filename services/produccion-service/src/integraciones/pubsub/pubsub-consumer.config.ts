export const PUBSUB_CONSUMER_CONFIG = Symbol('PUBSUB_CONSUMER_CONFIG');

export interface PubSubConsumerConfig {
  enabled: boolean;
  projectId: string;
  subscriptionId: string;
}

function enabled(value: string | undefined): boolean {
  const normalized = (value ?? 'false').trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no', ''].includes(normalized)) return false;
  throw new Error(`PUBSUB_CONSUMER_ENABLED debe ser true o false; se recibio "${value}"`);
}

function subscriptionId(value: string, projectId: string): string {
  if (!value.startsWith('projects/')) return value;
  const match = /^projects\/([^/]+)\/subscriptions\/([^/]+)$/.exec(value);
  if (!match) {
    throw new Error('PUBSUB_SUBSCRIPTION_ID debe ser un ID o projects/{project}/subscriptions/{subscription}');
  }
  if (match[1] !== projectId) {
    throw new Error(`El proyecto de la suscripcion (${match[1]}) no coincide con GCP_PROJECT_ID (${projectId})`);
  }
  return match[2];
}

export function loadPubSubConsumerConfig(
  env: NodeJS.ProcessEnv = process.env,
): PubSubConsumerConfig {
  const isEnabled = enabled(env.PUBSUB_CONSUMER_ENABLED);
  if (!isEnabled) {
    return {
      enabled: false,
      projectId: env.GCP_PROJECT_ID?.trim() ?? '',
      subscriptionId: env.PUBSUB_SUBSCRIPTION_ID?.trim() ?? '',
    };
  }
  const projectId = env.GCP_PROJECT_ID?.trim();
  const subscription = env.PUBSUB_SUBSCRIPTION_ID?.trim();
  if (!projectId) throw new Error('GCP_PROJECT_ID es obligatorio cuando PUBSUB_CONSUMER_ENABLED=true');
  if (!subscription) throw new Error('PUBSUB_SUBSCRIPTION_ID es obligatorio cuando PUBSUB_CONSUMER_ENABLED=true');
  return { enabled: true, projectId, subscriptionId: subscriptionId(subscription, projectId) };
}
