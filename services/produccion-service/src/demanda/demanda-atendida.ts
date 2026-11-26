import { EntityManager } from 'typeorm';
import { crearEventoDemandaAtendida } from '../integraciones/outbox/crear-evento-demanda-atendida';
import { ESTADO_OUTBOX_PENDIENTE } from '../integraciones/outbox/entities/evento-outbox.entity';
import { DEMANDA_ATENDIDA_V1 } from '../integraciones/contratos/ventas-demanda-atendida-v1';
import { ESTADO_DEMANDA_CONFIRMADA } from './entities/demanda.entity';

export const AGREGADO_DEMANDA = 'Demanda';

export type ResultadoDemandaAtendida = 'REGISTRADO' | 'YA_REGISTRADO' | 'NO_ATENDIDA' | 'SIN_DEMANDA';

// Cantidades NUMERIC(14,4) como enteros de diezmilésimas: sin errores de coma flotante.
function diezmilesimas(valor: string): bigint {
  const [entero, decimales = ''] = String(valor).split('.');
  return BigInt(entero) * 10000n + BigInt(decimales.padEnd(4, '0').slice(0, 4));
}

/**
 * ABC-432: una demanda confirmada queda atendida cuando, para cada producto pedido,
 * los lotes de sus órdenes FINALIZADAS suman al menos la cantidad pedida (los lotes
 * son lo producido, igual que en el cumplimiento de ABC-449).
 *
 * Se llama con el `manager` de la transacción que finaliza una orden o crea un lote:
 * el evento queda en el outbox en el mismo commit y nunca se publica aquí. La demanda
 * se bloquea para que dos transacciones no registren dos eventos; además la restricción
 * única del outbox (agregado + tipo) respalda que exista uno solo por demanda.
 */
export async function registrarDemandaAtendidaSiCorresponde(
  manager: EntityManager,
  demandaId: string | null | undefined,
  ahora: Date = new Date(),
): Promise<ResultadoDemandaAtendida> {
  if (!demandaId) return 'SIN_DEMANDA';
  const [demanda] = (await manager.query(
    `SELECT id::text AS id, origen, demanda_externa_id, estado FROM demandas WHERE id = $1 FOR UPDATE`,
    [demandaId],
  )) as Array<{ id: string; origen: 'VENTAS' | 'FACTURACION'; demanda_externa_id: string; estado: string }>;
  if (!demanda || demanda.estado !== ESTADO_DEMANDA_CONFIRMADA) return 'NO_ATENDIDA';

  const [existente] = await manager.query(
    `SELECT 1 FROM eventos_outbox WHERE aggregate_type = $1 AND aggregate_id = $2 AND event_type = $3`,
    [AGREGADO_DEMANDA, demanda.id, DEMANDA_ATENDIDA_V1],
  );
  if (existente) return 'YA_REGISTRADO';

  const items = (await manager.query(
    `SELECT di.producto_codigo, di.cantidad::text AS cantidad, di.unidad,
            COALESCE((
              SELECT SUM(l.cantidad)
                FROM ordenes_produccion o
                INNER JOIN recetas r ON r.id = o.receta_id
                INNER JOIN lotes l ON l.orden_id = o.id
               WHERE o.demanda_id = di.demanda_id
                 AND o.estado = 'FINALIZADA'
                 AND r.producto_codigo = di.producto_codigo
            ), 0)::text AS producido
       FROM demandas_items di
      WHERE di.demanda_id = $1
      ORDER BY di.id`,
    [demanda.id],
  )) as Array<{ producto_codigo: string; cantidad: string; unidad: string; producido: string }>;
  const atendida = items.length > 0 && items.every((it) => diezmilesimas(it.producido) >= diezmilesimas(it.cantidad));
  if (!atendida) return 'NO_ATENDIDA';

  const evento = crearEventoDemandaAtendida({
    demandaId: demanda.id,
    origen: demanda.origen,
    demandaExternaId: demanda.demanda_externa_id,
    // El contrato v1 informa la cantidad pedida: no hay atención parcial.
    items: items.map((it) => ({ productoCodigo: it.producto_codigo, cantidadAtendida: it.cantidad, unidad: it.unidad })),
    fechaAtencion: ahora,
  });
  const insertadas = (await manager.query(
    `INSERT INTO eventos_outbox (event_id, correlation_id, event_type, aggregate_type, aggregate_id, payload, estado)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     ON CONFLICT ON CONSTRAINT uq_eventos_outbox_agregado_evento DO NOTHING
     RETURNING id`,
    [evento.eventId, evento.correlationId, evento.eventType, AGREGADO_DEMANDA, demanda.id, JSON.stringify(evento), ESTADO_OUTBOX_PENDIENTE],
  )) as unknown[];
  return insertadas.length > 0 ? 'REGISTRADO' : 'YA_REGISTRADO';
}
