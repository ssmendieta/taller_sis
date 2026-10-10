export const PUBSUB_CONFIG = Symbol('PUBSUB_CONFIG');

export interface PubSubConfig {
  enabled: boolean;
  projectId: string;
  topicId: string;
}

function parseEnabled(value: string | undefined): boolean {
  const normalized = (value ?? 'false').trim().toLowerCase();

  if (['true', '1', 'yes'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', ''].includes(normalized)) {
    return false;
  }

  throw new Error(
    `PUBSUB_ENABLED debe ser true o false; se recibió "${value}"`,
  );
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} es obligatorio cuando PUBSUB_ENABLED=true`);
  }

  return value;
}

function normalizeTopicId(topic: string, projectId: string): string {
  if (!topic.startsWith('projects/')) {
    return topic;
  }

  const match = /^projects\/([^/]+)\/topics\/([^/]+)$/.exec(topic);
  if (!match) {
    throw new Error(
      'PUBSUB_TOPIC_ID debe ser un ID o projects/{project}/topics/{topic}',
    );
  }

  if (match[1] !== projectId) {
    throw new Error(
      `El proyecto del topic (${match[1]}) no coincide con GCP_PROJECT_ID (${projectId})`,
    );
  }

  return match[2];
}

export function loadPubSubConfig(
  env: NodeJS.ProcessEnv = process.env,
): PubSubConfig {
  const enabled = parseEnabled(env.PUBSUB_ENABLED);

  if (!enabled) {
    return {
      enabled: false,
      projectId: env.GCP_PROJECT_ID?.trim() ?? '',
      topicId: env.PUBSUB_TOPIC_ID?.trim() ?? '',
    };
  }

  const projectId = required(env, 'GCP_PROJECT_ID');
  const topic = required(env, 'PUBSUB_TOPIC_ID');

  return {
    enabled: true,
    projectId,
    topicId: normalizeTopicId(topic, projectId),
  };
}
