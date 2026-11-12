// ABC-386/387: configuración de Pub/Sub propia de Logística. Usa variables con
// prefijo LOGISTICA_ para no activarse por la configuración de Producción
// cuando ambos servicios leen el mismo .env.
export const PUBSUB_LOGISTICA_CONFIG = Symbol('PUBSUB_LOGISTICA_CONFIG');

export interface PubSubLogisticaConfig {
  projectId: string;
  publicacion: { enabled: boolean; topicId: string; timeoutMs: number };
  resultado: { enabled: boolean; subscriptionId: string };
  outbox: {
    batchSize: number;
    pollIntervalMs: number;
    leaseMs: number;
    retryBaseMs: number;
    retryMaxMs: number;
  };
}

function bandera(env: NodeJS.ProcessEnv, nombre: string): boolean {
  const valor = (env[nombre] ?? 'false').trim().toLowerCase();
  if (['true', '1', 'yes'].includes(valor)) return true;
  if (['false', '0', 'no', ''].includes(valor)) return false;
  throw new Error(`${nombre} debe ser true o false; se recibió "${env[nombre]}"`);
}

function entero(env: NodeJS.ProcessEnv, nombre: string, defecto: number): number {
  const texto = env[nombre]?.trim();
  if (!texto) return defecto;
  const valor = Number(texto);
  if (!Number.isSafeInteger(valor) || valor < 1) throw new Error(`${nombre} debe ser un entero positivo`);
  return valor;
}

function recurso(valor: string, projectId: string, tipo: 'topics' | 'subscriptions', nombre: string): string {
  if (!valor.startsWith('projects/')) return valor;
  const match = new RegExp(`^projects/([^/]+)/${tipo}/([^/]+)$`).exec(valor);
  if (!match) throw new Error(`${nombre} debe ser un ID o projects/{project}/${tipo}/{id}`);
  if (match[1] !== projectId) throw new Error(`El proyecto de ${nombre} no coincide con GCP_PROJECT_ID`);
  return match[2];
}

export function loadPubSubLogisticaConfig(env: NodeJS.ProcessEnv = process.env): PubSubLogisticaConfig {
  const projectId = env.GCP_PROJECT_ID?.trim() ?? '';
  const publica = bandera(env, 'LOGISTICA_PUBSUB_ENABLED');
  const consume = bandera(env, 'LOGISTICA_PUBSUB_RESULTADO_CONSUMER_ENABLED');
  // ABC-402: la infraestructura GCP es externa. Cuando no existen recursos
  // exclusivos de Logistica se reutilizan los recursos compartidos asignados.
  const topic = env.LOGISTICA_PUBSUB_SALIDA_TOPIC_ID?.trim()
    || env.PUBSUB_TOPIC_ID?.trim()
    || '';
  const suscripcion = env.LOGISTICA_PUBSUB_RESULTADO_SUBSCRIPTION_ID?.trim()
    || env.PUBSUB_SUBSCRIPTION_ID?.trim()
    || '';
  if ((publica || consume) && !projectId) throw new Error('GCP_PROJECT_ID es obligatorio cuando Logística usa Pub/Sub');
  if (publica && !topic) throw new Error('LOGISTICA_PUBSUB_SALIDA_TOPIC_ID es obligatorio cuando LOGISTICA_PUBSUB_ENABLED=true');
  if (consume && !suscripcion) {
    throw new Error('LOGISTICA_PUBSUB_RESULTADO_SUBSCRIPTION_ID es obligatorio cuando el consumidor de resultados está activo');
  }
  const retryBaseMs = entero(env, 'OUTBOX_RETRY_BASE_MS', 5000);
  const retryMaxMs = entero(env, 'OUTBOX_RETRY_MAX_MS', 300000);
  if (retryMaxMs < retryBaseMs) throw new Error('OUTBOX_RETRY_MAX_MS no puede ser menor que OUTBOX_RETRY_BASE_MS');
  const leaseMs = entero(env, 'OUTBOX_LEASE_MS', 30000);
  // Sin límite, el cliente de Google reintenta durante minutos con el broker caído y el
  // evento queda PROCESANDO sin error visible. Debe vencer antes que el lease.
  const timeoutMs = entero(env, 'LOGISTICA_PUBSUB_PUBLISH_TIMEOUT_MS', 10000);
  if (timeoutMs >= leaseMs) throw new Error('LOGISTICA_PUBSUB_PUBLISH_TIMEOUT_MS debe ser menor que OUTBOX_LEASE_MS');
  return {
    projectId,
    publicacion: {
      enabled: publica,
      topicId: publica ? recurso(topic, projectId, 'topics', 'LOGISTICA_PUBSUB_SALIDA_TOPIC_ID') : topic,
      timeoutMs,
    },
    resultado: {
      enabled: consume,
      subscriptionId: consume ? recurso(suscripcion, projectId, 'subscriptions', 'LOGISTICA_PUBSUB_RESULTADO_SUBSCRIPTION_ID') : suscripcion,
    },
    outbox: {
      batchSize: entero(env, 'OUTBOX_BATCH_SIZE', 20),
      pollIntervalMs: entero(env, 'OUTBOX_POLL_INTERVAL_MS', 5000),
      leaseMs,
      retryBaseMs,
      retryMaxMs,
    },
  };
}
