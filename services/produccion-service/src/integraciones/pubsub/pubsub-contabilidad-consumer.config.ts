export const PUBSUB_CONTABILIDAD_CONSUMER_CONFIG = Symbol('PUBSUB_CONTABILIDAD_CONSUMER_CONFIG');

export interface PubSubContabilidadConsumerConfig {
  enabled: boolean;
  projectId: string;
  topicId: string;
  subscriptionId: string;
}

function habilitado(value: string | undefined): boolean {
  const normalized = (value ?? 'false').trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no', ''].includes(normalized)) return false;
  throw new Error(`PUBSUB_CONTABILIDAD_CONSUMER_ENABLED debe ser true o false; se recibio "${value}"`);
}

function normalizar(value: string, projectId: string, resource: 'topics' | 'subscriptions', variable: string): string {
  if (!value.startsWith('projects/')) return value;
  const match = new RegExp(`^projects/([^/]+)/${resource}/([^/]+)$`).exec(value);
  if (!match) throw new Error(`${variable} debe ser un ID o projects/{project}/${resource}/{id}`);
  if (match[1] !== projectId) throw new Error(`El proyecto de ${variable} no coincide con GCP_PROJECT_ID`);
  return match[2];
}

export function loadPubSubContabilidadConsumerConfig(
  env: NodeJS.ProcessEnv = process.env,
): PubSubContabilidadConsumerConfig {
  const enabled = habilitado(env.PUBSUB_CONTABILIDAD_CONSUMER_ENABLED);
  const projectId = env.GCP_PROJECT_ID?.trim() ?? '';
  const topic = env.PUBSUB_CONTABILIDAD_RESULTADOS_TOPIC_ID?.trim() ?? '';
  const subscription = env.PUBSUB_CONTABILIDAD_RESULTADOS_SUBSCRIPTION_ID?.trim() ?? '';
  if (!enabled) return { enabled, projectId, topicId: topic, subscriptionId: subscription };
  if (!projectId) throw new Error('GCP_PROJECT_ID es obligatorio cuando el consumidor contable esta habilitado');
  if (!topic) throw new Error('PUBSUB_CONTABILIDAD_RESULTADOS_TOPIC_ID es obligatorio cuando el consumidor contable esta habilitado');
  if (!subscription) throw new Error('PUBSUB_CONTABILIDAD_RESULTADOS_SUBSCRIPTION_ID es obligatorio cuando el consumidor contable esta habilitado');
  return {
    enabled,
    projectId,
    topicId: normalizar(topic, projectId, 'topics', 'PUBSUB_CONTABILIDAD_RESULTADOS_TOPIC_ID'),
    subscriptionId: normalizar(subscription, projectId, 'subscriptions', 'PUBSUB_CONTABILIDAD_RESULTADOS_SUBSCRIPTION_ID'),
  };
}
