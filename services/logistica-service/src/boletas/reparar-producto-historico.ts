import { BadGatewayException, ConflictException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { LotesProduccionClient } from '../disponibilidad-documental/lotes-produccion.client';

interface BoletaHistorica {
  id: string;
  orden_id: string;
  estado: string;
  producto_codigo: string | null;
  unidad: string | null;
  despachada: boolean;
}

const UNIDADES = new Set(['kg', 'g', 'l', 'ml', 'm', 'cm', 'unidad', 'docena', 'caja', 'paquete']);
const idValido = (id: string) => /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= BigInt('9223372036854775807');
const incompleta = (b: BoletaHistorica) => b.producto_codigo === null || b.unidad === null;
const SELECT = `SELECT b.id::text, s.orden_id::text, b.estado, b.producto_codigo, b.unidad,
  EXISTS (SELECT 1 FROM rutas_paradas_boletas rb
    JOIN rutas_paradas p ON p.id = rb.parada_id JOIN rutas r ON r.id = p.ruta_id
    WHERE rb.boleta_id = b.id AND r.estado IN ('DESPACHADA','COMPLETADA')) AS despachada
  FROM boletas_envio b JOIN solicitudes_salida s ON s.id = b.solicitud_salida_id
  WHERE b.id = ANY($1::bigint[]) ORDER BY b.id`;

// Mantenimiento explícito ABC-385. No emite, anula o despacha documentos,
// no toca outbox/inbox y no consulta directamente la base de Producción.
export async function repararProductoHistorico(
  source: DataSource,
  produccion: Pick<LotesProduccionClient, 'consultarOrdenPorId'>,
  ids: string[],
  usuarioId: string,
  authorization: string,
  aplicar = false,
) {
  if (!ids.length || ids.some((id) => !idValido(id)) || new Set(ids).size !== ids.length || !idValido(usuarioId)) {
    throw new Error('Se requieren IDs de boletas únicos y un actor válido.');
  }
  if (!/^Bearer\s+\S+$/i.test(authorization)) throw new Error('Se requiere una sesión autorizada.');
  const iniciales: BoletaHistorica[] = await source.query(SELECT, [ids]);
  if (iniciales.length !== ids.length) throw new Error('Alguna boleta solicitada no existe.');
  const plan: Array<{ boletaId: string; ordenId: string; anterior: { productoCodigo: string | null; unidad: string | null };
    nuevo: { productoCodigo: string; unidad: string } }> = [];
  for (const b of iniciales.filter(incompleta)) {
    if (b.estado !== 'EMITIDA' || b.despachada) {
      throw new ConflictException(`Boleta ${b.id}: solo se completan emitidas que no fueron despachadas.`);
    }
    const orden = await produccion.consultarOrdenPorId(b.orden_id, authorization);
    const codigo = orden.producto?.codigo;
    const unidad = orden.producto?.unidad_producto ?? orden.unidad_producto;
    if (String(orden.id) !== b.orden_id || typeof codigo !== 'string' || !codigo.trim() || codigo.trim().length > 80
      || typeof unidad !== 'string' || !UNIDADES.has(unidad.trim())) {
      throw new BadGatewayException(`Producción no devolvió producto y unidad verificables para la boleta ${b.id}.`);
    }
    const nuevo = { productoCodigo: codigo.trim(), unidad: unidad.trim() };
    if ((b.producto_codigo !== null && b.producto_codigo !== nuevo.productoCodigo)
      || (b.unidad !== null && b.unidad !== nuevo.unidad)) {
      throw new ConflictException(`Boleta ${b.id}: los datos existentes contradicen Producción; requiere revisión.`);
    }
    plan.push({ boletaId: b.id, ordenId: b.orden_id,
      anterior: { productoCodigo: b.producto_codigo, unidad: b.unidad }, nuevo });
  }
  if (aplicar && plan.length) {
    await source.transaction(async (manager: EntityManager) => {
      await manager.query('SELECT id FROM boletas_envio WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE', [ids]);
      // Consulta nueva tras adquirir los bloqueos: también ve un despacho que
      // haya terminado mientras esperábamos el lock de sus boletas.
      const actuales: BoletaHistorica[] = await manager.query(SELECT, [ids]);
      // Evita aplicar un plan obsoleto si otro proceso emitió, anuló o completó una boleta.
      if (JSON.stringify(actuales) !== JSON.stringify(iniciales)) throw new ConflictException('Las boletas cambiaron; vuelve a ejecutar la revisión.');
      for (const cambio of plan) {
        await manager.query(`UPDATE boletas_envio SET producto_codigo = COALESCE(producto_codigo, $2),
          unidad = COALESCE(unidad, $3), actualizado_en = NOW() WHERE id = $1`,
        [cambio.boletaId, cambio.nuevo.productoCodigo, cambio.nuevo.unidad]);
        await manager.query(`INSERT INTO boletas_envio_historial
          (boleta_id, estado_anterior, estado_nuevo, usuario_actor_id, motivo)
          VALUES ($1, 'EMITIDA', 'EMITIDA', $2, $3)`, [cambio.boletaId, usuarioId,
          `ABC-385: completar datos históricos desde API Producción, orden ${cambio.ordenId}. `
          + `Anterior: ${JSON.stringify(cambio.anterior)}. Nuevo: ${JSON.stringify(cambio.nuevo)}.`]);
      }
    });
  }
  return { modo: aplicar ? 'APLICAR' : 'REVISION', modificadas: aplicar ? plan.length : 0, plan };
}
