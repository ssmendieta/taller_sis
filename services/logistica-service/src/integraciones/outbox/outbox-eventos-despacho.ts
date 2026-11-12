import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { DespachoRegistrado, EventosDespacho } from '../../despacho/eventos-despacho';
import {
  DESPACHO_RUTA_REGISTRADO_V1,
  DespachoRutaRegistradoV1Event,
  FUENTE_LOGISTICA,
} from '../contratos/inventarios-salida-v1';
import { validarDespachoRutaRegistradoV1 } from '../contratos/inventarios-salida-v1.validator';
import { EventoOutbox } from './entities/evento-outbox.entity';

export const AGREGADO_RUTA = 'Ruta';

// ABC-386: implementa el punto de ABC-376. Se ejecuta con el `manager` de la
// transacción del despacho: si algo falla, se revierte el despacho completo.
// Nunca publica aquí; el publicador lo hace después del commit.
@Injectable()
export class OutboxEventosDespacho implements EventosDespacho {
  async registrarDespacho(manager: EntityManager, despacho: DespachoRegistrado): Promise<void> {
    const filas = await manager.query(
      `SELECT boleta.id::text AS boleta_id, boleta.numero, solicitud.orden_id::text AS orden_id,
              boleta.producto_codigo, boleta.unidad, item.referencia, item.cantidad::text AS cantidad
         FROM boletas_envio boleta
         INNER JOIN solicitudes_salida solicitud ON solicitud.id = boleta.solicitud_salida_id
         INNER JOIN boletas_envio_items item ON item.boleta_id = boleta.id
        WHERE boleta.id = ANY($1::bigint[])
        ORDER BY boleta.id, item.id`,
      [despacho.boletaIds],
    ) as Array<{
      boleta_id: string;
      numero: string;
      orden_id: string;
      producto_codigo: string | null;
      unidad: string | null;
      referencia: string;
      cantidad: string;
    }>;

    const boletas = new Map<string, DespachoRutaRegistradoV1Event['data']['boletas'][number]>();
    for (const fila of filas) {
      const boleta = boletas.get(fila.boleta_id) ?? {
        boletaId: fila.boleta_id,
        numero: fila.numero,
        ordenId: fila.orden_id,
        productoCodigo: fila.producto_codigo ?? '',
        unidad: fila.unidad ?? '',
        items: [],
      };
      boletas.set(fila.boleta_id, boleta);
      boleta.items.push({ loteReferencia: fila.referencia, cantidad: normalizar(fila.cantidad) });
    }

    const evento: DespachoRutaRegistradoV1Event = {
      eventId: randomUUID(),
      eventType: DESPACHO_RUTA_REGISTRADO_V1,
      occurredAt: despacho.despachadaEn.toISOString(),
      source: FUENTE_LOGISTICA,
      correlationId: randomUUID(),
      data: {
        rutaId: despacho.rutaId,
        fechaProgramada: despacho.fechaProgramada,
        despachadaEn: despacho.despachadaEn.toISOString(),
        despachadaPorUsuarioId: despacho.despachadaPorUsuarioId,
        vehiculoExternoId: despacho.vehiculoExternoId,
        choferExternoId: despacho.choferExternoId,
        boletas: [...boletas.values()],
      },
    };
    // Un evento inválido revierte el despacho en lugar de guardar algo que Inventarios rechazaría.
    validarDespachoRutaRegistradoV1(evento);

    await manager.insert(EventoOutbox, {
      eventId: evento.eventId,
      correlationId: evento.correlationId,
      eventType: evento.eventType,
      aggregateType: AGREGADO_RUTA,
      aggregateId: despacho.rutaId,
      payload: evento,
    });
  }
}

// La base devuelve NUMERIC(14,4) como texto; se asegura el formato de 4 decimales del contrato.
function normalizar(cantidad: string): string {
  const [entero, decimales = ''] = cantidad.split('.');
  return `${entero}.${decimales.padEnd(4, '0').slice(0, 4)}`;
}
