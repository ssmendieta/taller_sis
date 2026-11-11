import { randomUUID } from 'crypto';
import { PubSub } from '@google-cloud/pubsub';
import { DEMANDA_REGISTRADA_V1 } from '../integraciones/contratos/ventas-demanda-v1';

// ABC-359: publica casos de prueba de DemandaRegistrada.v1 e imprime la evidencia
// (fecha/hora, eventId, messageId y cuerpo). Con PUBSUB_EMULATOR_HOST usa el
// emulador; sin esa variable usa Google Cloud real con GOOGLE_APPLICATION_CREDENTIALS.
//
//   GCP_PROJECT_ID=... PUBSUB_DEMANDA_TOPIC_ID=... npm run demanda:publicar-prueba

const proyecto = process.env.GCP_PROJECT_ID?.trim();
const topicId = process.env.PUBSUB_DEMANDA_TOPIC_ID?.trim();
if (!proyecto || !topicId) {
  console.error('Defina GCP_PROJECT_ID y PUBSUB_DEMANDA_TOPIC_ID.');
  process.exit(2);
}

const entorno = process.env.PUBSUB_EMULATOR_HOST ? `EMULADOR ${process.env.PUBSUB_EMULATOR_HOST}` : 'GOOGLE CLOUD REAL';
const sufijo = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const base = {
  origen: 'VENTAS',
  demandaExternaId: `PED-PRUEBA-${sufijo}`,
  fechaRequerida: '2026-11-30',
  items: [{ productoCodigo: 'GAL-001', cantidad: '40.0000', unidad: 'kg' }],
};
const evento = (data: Record<string, unknown>, eventId = randomUUID()) => ({
  eventId,
  eventType: DEMANDA_REGISTRADA_V1,
  occurredAt: new Date().toISOString(),
  source: 'ventas-prueba-abc359',
  correlationId: randomUUID(),
  data,
});

async function main() {
  const topic = new PubSub({ projectId: proyecto }).topic(topicId!);
  const valido = evento(base);
  const casos: Array<[string, unknown]> = [
    ['valido', valido],
    ['redelivery mismo eventId', valido],
    ['mismo pedido otro eventId', evento(base)],
    ['contradictorio', evento({ ...base, fechaRequerida: '2026-12-15' })],
    ['invalido (unidad)', evento({ ...base, demandaExternaId: `${base.demandaExternaId}-BAD`, items: [{ productoCodigo: 'GAL-001', cantidad: '5', unidad: 'cajas' }] })],
  ];
  console.log(`Entorno: ${entorno} · proyecto ${proyecto} · topic ${topicId}`);
  for (const [caso, cuerpo] of casos) {
    const messageId = await topic.publishMessage({ data: Buffer.from(JSON.stringify(cuerpo)) });
    console.log(JSON.stringify({
      caso, publicadoEn: new Date().toISOString(), messageId,
      eventId: (cuerpo as { eventId: string }).eventId, cuerpo,
    }));
  }
}

main().catch((error) => {
  console.error(`No se pudo publicar: ${(error as Error).message}`);
  process.exit(1);
});
