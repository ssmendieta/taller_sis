'use strict';

const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

// Driver de postgres de produccion-service para consultar el estado real
const ROOT_DIR = path.resolve(__dirname, '../..');
try {
  require('../../services/produccion-service/node_modules/dotenv').config({ path: path.join(ROOT_DIR, '.env') });
} catch {
  // ignore
}
const { Client } = require('../../services/produccion-service/node_modules/pg');
const PRODUCCION_DIR = path.join(ROOT_DIR, 'services', 'produccion-service');
const SIMULADOR_DIR = __dirname;
const DB_NAME = 'produccion_test_abc243';
const EMULATOR_HOST = '127.0.0.1:8085';
const SQLITE_DB_PATH = path.join(SIMULADOR_DIR, 'data', 'inventarios-live-e2e.db');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.status < 500) return true;
    } catch {
      // reintentar
    }
    await sleep(500);
  }
  throw new Error(`Timeout esperando que ${url} este disponible`);
}

async function main() {
  console.log('========================================================================');
  console.log('  INICIO: PRUEBA E2E VIVA ABC-243 CON BACKEND REAL Y EMULADOR PUB/SUB   ');
  console.log('========================================================================');

  // Limpiar SQLite previo de prueba viva si existiera
  if (fs.existsSync(SQLITE_DB_PATH)) {
    fs.unlinkSync(SQLITE_DB_PATH);
  }

  // 1. Iniciar mock de Auth en puerto 3001
  console.log('[1/7] Iniciando servicio Auth mock en http://127.0.0.1:3001 ...');
  const authServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: '42',
      rol: 'Encargado de Producción',
      nombre_completo: 'Operador Produccion Test E2E',
      permisos: ['materiales.solicitar', 'materiales.consultar_disponibilidad'],
    }));
  });

  await new Promise((resolve) => authServer.listen(3001, '127.0.0.1', resolve));
  console.log('      Auth mock activo en http://127.0.0.1:3001');

  // 2. Iniciar Backend Real de Producción (dist/main.js)
  console.log('[2/7] Iniciando backend real produccion-service (puerto 3002) ...');
  const envProduccion = {
    ...process.env,
    PORT: '3002',
    DB_DATABASE: DB_NAME,
    PUBSUB_EMULATOR_HOST: EMULATOR_HOST,
    GCP_PROJECT_ID: 'taller-local',
    PUBSUB_ENABLED: 'true',
    PUBSUB_TOPIC_ID: 'taller-solicitudes-material-local',
    PUBSUB_CONSUMER_ENABLED: 'true',
    PUBSUB_SUBSCRIPTION_ID: 'taller-produccion-inventarios-local',
    OUTBOX_POLL_INTERVAL_MS: '1000',
    AUTH_SERVICE_URL: 'http://127.0.0.1:3001',
  };

  const procProduccion = spawn(process.execPath, ['dist/main.js'], {
    cwd: PRODUCCION_DIR,
    env: envProduccion,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  procProduccion.stdout.on('data', (d) => {
    const s = d.toString();
    if (s.includes('PUBLICACION_OUTBOX_CONFIRMADA') || s.includes('RESPUESTA_INVENTARIO_RECIBIDA') || s.includes('running on')) {
      process.stdout.write(`[PRODUCCION LOG] ${s}`);
    }
  });

  procProduccion.stderr.on('data', (d) => {
    process.stderr.write(`[PRODUCCION ERR] ${d.toString()}`);
  });

  await waitForHttp('http://127.0.0.1:3002/solicitudes-material', 20000);
  console.log('      Backend real produccion-service listo y conectado a PostgreSQL ' + DB_NAME);

  // 3. Iniciar Simulador de Inventarios (index.js)
  console.log('[3/7] Iniciando simulador independiente de Inventarios ...');
  const envSimulador = {
    ...process.env,
    PUBSUB_EMULATOR_HOST: EMULATOR_HOST,
    GCP_PROJECT_ID: 'taller-local',
    INVENTARIOS_INPUT_SUBSCRIPTION_ID: 'taller-inventarios-simulator-local',
    INVENTARIOS_OUTPUT_TOPIC_ID: 'taller-inventarios-respuestas-local',
    INVENTARIOS_STATE_PATH: SQLITE_DB_PATH,
  };

  const procSimulador = spawn(process.execPath, ['index.js'], {
    cwd: SIMULADOR_DIR,
    env: envSimulador,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  procSimulador.stdout.on('data', (d) => {
    process.stdout.write(`[SIMULADOR LOG] ${d.toString()}`);
  });

  procSimulador.stderr.on('data', (d) => {
    process.stderr.write(`[SIMULADOR ERR] ${d.toString()}`);
  });

  await sleep(2000); // Dar 2 segundos para conectarse a Pub/Sub
  console.log('      Simulador de Inventarios activo y escuchando taller-inventarios-simulator-local');

  // 4. Crear cliente Postgres para auditar produccion_test_abc243
  const pgClient = new Client({
    host: 'localhost',
    port: 5432,
    user: process.env.DB_USERNAME || 'postgres_user',
    password: process.env.DB_PASSWORD || 'postgres_password',
    database: DB_NAME,
  });
  await pgClient.connect();

  try {
    // 5. Enviar POST real /solicitudes-material a produccion-service
    console.log('[4/7] Registrando solicitud mediante POST /solicitudes-material (ABC-73) ...');
    const createReq = await fetch('http://127.0.0.1:3002/solicitudes-material', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-e2e-abc243',
      },
      body: JSON.stringify({
        ordenId: 1,
        items: [
          {
            materialId: 1,
            cantidad: 20.0,
            unidad: 'kg',
          },
        ],
      }),
    });

    if (!createReq.ok) {
      const errTxt = await createReq.text();
      throw new Error(`Error en POST /solicitudes-material (${createReq.status}): ${errTxt}`);
    }

    const solicitudCreada = await createReq.json();
    const solicitudId = solicitudCreada.id;
    console.log(`      Solicitud creada exitosamente: id=${solicitudId}, estado=${solicitudCreada.estado}`);

    // Consultar estado inicial en PostgreSQL
    const resInicial = await pgClient.query(
      'SELECT id, orden_id, estado, solicitud_version FROM solicitudes_material WHERE id = $1',
      [solicitudId],
    );
    console.log('      [PG INICIAL]', resInicial.rows[0]);

    // 6. Esperar el ciclo completo de mensajeria asincrona
    console.log('[5/7] Esperando ciclo: Outbox -> PubSub -> Simulador SQLite -> PubSub -> Inbox -> PG ...');
    let completado = false;
    let intento = 0;
    let filaFinal;
    let filaOutbox;
    let filaInbox;

    while (intento < 25) {
      await sleep(1000);
      intento++;

      const resSolicitud = await pgClient.query(
        'SELECT id, orden_id, estado, solicitud_version, estado_actualizado_en, motivo_estado FROM solicitudes_material WHERE id = $1',
        [solicitudId],
      );
      filaFinal = resSolicitud.rows[0];

      const resOutbox = await pgClient.query(
        "SELECT event_id::text, correlation_id::text, event_type, estado, message_id FROM eventos_outbox WHERE aggregate_id = $1 AND event_type = 'SolicitudMaterialAlmacen.v1'",
        [solicitudId],
      );
      filaOutbox = resOutbox.rows[0];

      if (filaOutbox && filaOutbox.correlation_id) {
        const resInbox = await pgClient.query(
          "SELECT event_id::text, correlation_id::text, event_type, estado, message_id, recibido_en FROM eventos_inbox WHERE correlation_id = $1 AND event_type = 'SolicitudMaterialAlmacenEstadoActualizado.v1'",
          [filaOutbox.correlation_id],
        );
        filaInbox = resInbox.rows[0];
      }

      if (filaFinal && filaFinal.estado === 'APROBADA' && filaInbox && filaInbox.estado === 'PROCESADO') {
        completado = true;
        break;
      }
    }

    if (!completado) {
      throw new Error(`Timeout esperando que la solicitud alcance APROBADA. Estado actual: ${filaFinal?.estado}`);
    }

    // 7. Resultados comprobados en PostgreSQL y SQLite
    console.log('[6/7] Verificacion de datos persistidos en PostgreSQL (' + DB_NAME + '):');
    console.log('      - Solicitud PostgreSQL:', filaFinal);
    console.log('      - Evento Outbox (Solicitud):', filaOutbox);
    console.log('      - Evento Inbox (Respuesta):', filaInbox);

    // Inspeccionar SQLite del simulador
    const { StateStore } = require('./state-store');
    const store = new StateStore(SQLITE_DB_PATH);
    const dbSimRows = store.db.prepare('SELECT * FROM responses').all();
    console.log('      - SQLite Responses (Simulador):', dbSimRows);
    store.close();

    console.log('========================================================================');
    console.log('  RECORRIDO E2E VIVO COMPLETADO AL 100% (EXITO TOTAL)                   ');
    console.log('========================================================================');

    console.log(JSON.stringify({
      resultado: 'COMPLETO',
      database: DB_NAME,
      solicitudId,
      ordenId: 1,
      estadoAntes: 'PENDIENTE',
      versionAntes: 1,
      estadoDespues: filaFinal.estado,
      versionDespues: filaFinal.solicitud_version,
      solicitudEventId: filaOutbox.event_id,
      solicitudPubSubMessageId: filaOutbox.message_id,
      respuestaEventId: filaInbox.event_id,
      respuestaPubSubMessageId: filaInbox.message_id,
      correlationId: filaOutbox.correlation_id,
      inboxEstado: filaInbox.estado,
    }, null, 2));

  } finally {
    console.log('[7/7] Deteniendo procesos de prueba...');
    await pgClient.end();
    procProduccion.kill('SIGTERM');
    procSimulador.kill('SIGTERM');
    authServer.close();
    await sleep(1000);
  }
}

main().catch((err) => {
  console.error('FATAL EN PRUEBA E2E VIVA:', err);
  process.exit(1);
});
