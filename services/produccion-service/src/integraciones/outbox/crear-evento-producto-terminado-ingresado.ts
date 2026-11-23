import { randomUUID } from 'crypto';
import { Lote } from '../../lotes/entities/lote.entity';
import { OrdenProduccion } from '../../ordenes/entities/orden-produccion.entity';
import { PRODUCTO_TERMINADO_INGRESADO_V1, ProductoTerminadoIngresadoV1Event } from '../contratos/producto-terminado-ingresado-v1';
import { validarProductoTerminadoIngresadoV1 } from '../contratos/producto-terminado-ingresado-v1.validator';

// Se construye una sola vez con el lote ya guardado, dentro de su transacción.
// El publicador reutiliza este payload y su eventId en los reintentos.
export function crearEventoProductoTerminadoIngresado(lote: Lote, orden: OrdenProduccion): ProductoTerminadoIngresadoV1Event {
  return validarProductoTerminadoIngresadoV1({
    eventId: randomUUID(),
    eventType: PRODUCTO_TERMINADO_INGRESADO_V1,
    occurredAt: lote.fechaHora.toISOString(),
    source: 'produccion-service',
    correlationId: randomUUID(),
    data: {
      loteId: lote.id,
      loteCodigo: lote.codigo,
      ordenId: orden.id,
      ordenCodigo: orden.codigo,
      productoId: String(orden.producto_id),
      cantidadConforme: lote.cantidad,
      fechaIngreso: lote.fechaHora.toISOString(),
    },
  });
}
