import { PubSub } from '@google-cloud/pubsub';
import { randomUUID } from 'crypto';
import { AppDataSource } from '../database/data-source';
import { DEMANDA_CONFIRMADA_V1 } from '../integraciones/contratos/ventas-confirmacion-demanda-v1';
import { DEMANDA_REGISTRADA_V1 } from '../integraciones/contratos/ventas-demanda-v1';

const pausa = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function esperar<T>(consulta: () => Promise<T | null>, descripcion: string, timeoutMs = 20000): Promise<T> {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    const resultado = await consulta();
    if (resultado) return resultado;
    await pausa(250);
  }
  throw new Error(`Tiempo agotado esperando ${descripcion}`);
}

async function main(): Promise<void> {
  const emulator = process.env.PUBSUB_EMULATOR_HOST?.trim();
  if (!emulator || emulator.includes('googleapis.com')) {
    throw new Error('Esta verificacion exige PUBSUB_EMULATOR_HOST local; no opera contra Google Cloud real');
  }
  const projectId = process.env.GCP_PROJECT_ID?.trim() || 'taller-local';
  const demandaTopic = process.env.TALLER_DEMANDA_TOPIC?.trim() || 'taller-ventas-demanda-local';
  const confirmacionTopic = process.env.TALLER_DEMANDA_CONFIRMACION_TOPIC?.trim()
    || 'taller-ventas-demanda-confirmacion-local';
  const sufijo = Date.now().toString();
  const demandaExternaId = `ABC365-LOCAL-${sufijo}`;
  const correlationId = randomUUID();
  const confirmacionEventId = randomUUID();
  const demandaEventId = randomUUID();
  const occurredAt = new Date().toISOString();
  const pubsub = new PubSub({ projectId });

  await AppDataSource.initialize();
  try {
    const confirmacion = {
      eventId: confirmacionEventId,
      eventType: DEMANDA_CONFIRMADA_V1,
      occurredAt,
      source: 'ventas-simulator-local',
      correlationId,
      data: { origen: 'VENTAS', demandaExternaId },
    };
    const confirmacionMessageId = await pubsub.topic(confirmacionTopic).publishMessage({
      data: Buffer.from(JSON.stringify(confirmacion)),
      attributes: { eventType: DEMANDA_CONFIRMADA_V1 },
    });

    const pendiente = await esperar(async () => {
      const rows = await AppDataSource.query(
        'SELECT estado, intentos FROM eventos_inbox WHERE event_id = $1',
        [confirmacionEventId],
      );
      return rows[0]?.estado === 'PENDIENTE' ? rows[0] : null;
    }, 'inbox PENDIENTE de la confirmacion adelantada');

    const demanda = {
      eventId: demandaEventId,
      eventType: DEMANDA_REGISTRADA_V1,
      occurredAt: new Date().toISOString(),
      source: 'ventas-simulator-local',
      correlationId,
      data: {
        origen: 'VENTAS',
        demandaExternaId,
        fechaRequerida: '2026-11-15',
        items: [{ productoCodigo: 'ABC365-PRUEBA', cantidad: '1.0000', unidad: 'unidad' }],
      },
    };
    const demandaMessageId = await pubsub.topic(demandaTopic).publishMessage({
      data: Buffer.from(JSON.stringify(demanda)),
      attributes: { eventType: DEMANDA_REGISTRADA_V1 },
    });

    const aplicada = await esperar(async () => {
      const rows = await AppDataSource.query(
        `SELECT d.id, d.estado, d.confirmacion_event_id, i.estado AS inbox_estado, i.intentos
         FROM demandas d
         JOIN eventos_inbox i ON i.event_id = $1
         WHERE d.origen = 'VENTAS' AND d.demanda_externa_id = $2`,
        [confirmacionEventId, demandaExternaId],
      );
      return rows[0]?.estado === 'CONFIRMADA' && rows[0]?.inbox_estado === 'PROCESADO' ? rows[0] : null;
    }, 'reproceso y confirmacion de la demanda');

    const duplicateMessageId = await pubsub.topic(confirmacionTopic).publishMessage({
      data: Buffer.from(JSON.stringify(confirmacion)),
      attributes: { eventType: DEMANDA_CONFIRMADA_V1 },
    });
    await pausa(1000);
    const [{ total }] = await AppDataSource.query(
      'SELECT COUNT(*)::int AS total FROM eventos_inbox WHERE event_id = $1',
      [confirmacionEventId],
    );
    if (total !== 1) throw new Error(`La redelivery genero ${total} filas de inbox; se esperaba 1`);

    process.stdout.write(`${JSON.stringify({
      evidencia: 'ABC-365-local',
      simulada: true,
      emulator,
      demandaExternaId,
      confirmacionMessageId,
      demandaMessageId,
      duplicateMessageId,
      pendiente,
      aplicada,
      inboxDuplicados: total,
      verificadoEn: new Date().toISOString(),
    }, null, 2)}\n`);
  } finally {
    await AppDataSource.destroy();
    await pubsub.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
