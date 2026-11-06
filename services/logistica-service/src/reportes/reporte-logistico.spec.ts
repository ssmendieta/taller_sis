import { EstadoBoleta } from '../boletas/entities/estado-boleta.enum';
import { EstadoEntrega } from '../despacho/estado-entrega.enum';
import { TipoIncidencia } from '../incidencias/entities/tipo-incidencia.enum';
import { EstadoRuta } from '../rutas/entities/estado-ruta.enum';
import { ReporteLogisticoQuery } from './dto/reporte-logistico.dto';
import { armarReporte, DatosReporte } from './reporte-logistico';

const FILTROS: ReporteLogisticoQuery = { fechaDesde: '2026-11-01', fechaHasta: '2026-11-30', estadoRuta: null, estadoBoleta: null };
const GENERADO = new Date('2026-11-06T22:00:00.000Z');
const { EMITIDA, ANULADA, BORRADOR } = EstadoBoleta;
const { PENDIENTE, ENTREGADA } = EstadoEntrega;

const ruta = (id: string, estado: EstadoRuta, fecha = '2026-11-10') =>
  ({ id, fecha_programada: fecha, estado, vehiculo_externo_id: 'VEH-01', chofer_externo_id: 'CHO-12' });

// Ruta 1 (COMPLETADA): parada 10 ENTREGADA con boletas 1, 2 y 3 (la 3 se anuló
// después) y parada 11 ENTREGADA con la boleta 4. 2 incidencias de un tipo y 1 de
// otro, 1 reprogramación. Ruta 2 (DESPACHADA): parada 20 PENDIENTE con la boleta 5.
// Ruta 3 (CANCELADA): parada 30 PENDIENTE con la boleta 1, que luego pasó a la ruta 1.
function datos(): DatosReporte {
  return {
    rutas: [ruta('1', EstadoRuta.COMPLETADA), ruta('2', EstadoRuta.DESPACHADA, '2026-11-12'), ruta('3', EstadoRuta.CANCELADA, '2026-11-09')],
    paradas: [
      { id: '10', ruta_id: '1', estado_entrega: ENTREGADA }, { id: '11', ruta_id: '1', estado_entrega: ENTREGADA },
      { id: '20', ruta_id: '2', estado_entrega: PENDIENTE }, { id: '30', ruta_id: '3', estado_entrega: PENDIENTE },
    ],
    documentosRuta: [
      { parada_id: '10', boleta_id: '1', estado: EMITIDA }, { parada_id: '10', boleta_id: '2', estado: EMITIDA },
      { parada_id: '10', boleta_id: '3', estado: ANULADA }, { parada_id: '11', boleta_id: '4', estado: EMITIDA },
      { parada_id: '20', boleta_id: '5', estado: EMITIDA }, { parada_id: '30', boleta_id: '1', estado: EMITIDA },
    ],
    incidencias: [
      { ruta_id: '1', tipo: TipoIncidencia.RETRASO, total: 2 }, { ruta_id: '1', tipo: TipoIncidencia.CARGA_DANADA, total: 1 },
      { ruta_id: '2', tipo: TipoIncidencia.RETRASO, total: 1 },
    ],
    reprogramaciones: [{ ruta_id: '1', total: 1 }],
    boletas: [
      { id: '1', numero: 'BOL-2026-00001', fecha: '2026-11-03', estado: EMITIDA, orden_id: '7' },
      { id: '2', numero: 'BOL-2026-00002', fecha: '2026-11-03', estado: EMITIDA, orden_id: '7' },
      { id: '3', numero: 'BOL-2026-00003', fecha: '2026-11-04', estado: ANULADA, orden_id: '8' },
      { id: '4', numero: 'BOL-2026-00004', fecha: '2026-11-04', estado: EMITIDA, orden_id: '9' },
      { id: '5', numero: 'BOL-2026-00005', fecha: '2026-11-05', estado: EMITIDA, orden_id: '10' },
      { id: '6', numero: 'BOL-2026-00006', fecha: '2026-11-05', estado: BORRADOR, orden_id: '7' },
    ],
    // Cantidades ya sumadas por boleta: la boleta 1 tiene 3 ítems.
    itemsBoleta: [
      { boleta_id: '1', items: 3, cantidad: '600.5000' }, { boleta_id: '2', items: 2, cantidad: '399.5000' },
      { boleta_id: '3', items: 1, cantidad: '50.0000' }, { boleta_id: '4', items: 1, cantidad: '12.0000' },
      { boleta_id: '5', items: 4, cantidad: '20.0000' }, { boleta_id: '6', items: 1, cantidad: '5.0000' },
    ],
    ubicacionBoletas: [
      { boleta_id: '1', ruta_id: '3', estado_ruta: EstadoRuta.CANCELADA, estado_entrega: PENDIENTE },
      { boleta_id: '1', ruta_id: '1', estado_ruta: EstadoRuta.COMPLETADA, estado_entrega: ENTREGADA },
      { boleta_id: '2', ruta_id: '1', estado_ruta: EstadoRuta.COMPLETADA, estado_entrega: ENTREGADA },
      { boleta_id: '3', ruta_id: '1', estado_ruta: EstadoRuta.COMPLETADA, estado_entrega: ENTREGADA },
      { boleta_id: '4', ruta_id: '1', estado_ruta: EstadoRuta.COMPLETADA, estado_entrega: ENTREGADA },
      { boleta_id: '5', ruta_id: '2', estado_ruta: EstadoRuta.DESPACHADA, estado_entrega: PENDIENTE },
    ],
    unidades: new Map([['7', 'kg'], ['8', 'kg'], ['9', 'caja'], ['10', null]]),
  };
}

describe('ABC-340: armado del reporte logístico', () => {
  const reporte = () => armarReporte(FILTROS, datos(), GENERADO, ['aviso de prueba']);

  it('totales por ruta exactos aunque haya varias paradas, ítems e incidencias', () => {
    const [completada, despachada, cancelada] = reporte().rutas;
    expect(completada).toEqual({
      id: '1', fechaProgramada: '2026-11-10', estado: 'COMPLETADA', vehiculoExternoId: 'VEH-01', choferExternoId: 'CHO-12',
      paradas: { total: 2, entregadas: 2, pendientes: 0, anuladas: 0 },
      boletas: { total: 4, emitidas: 3, anuladas: 1, entregadas: 3 },
      incidencias: 3, reprogramaciones: 1,
    });
    expect(despachada).toMatchObject({ paradas: { total: 1, pendientes: 1 }, boletas: { total: 1, entregadas: 0 }, incidencias: 1, reprogramaciones: 0 });
    expect(cancelada).toMatchObject({ paradas: { total: 1, pendientes: 1 }, boletas: { total: 1, entregadas: 0 }, incidencias: 0 });
  });

  it('una boleta anulada en una parada entregada no cuenta como entregada (CA-02)', () => {
    const r = reporte();
    expect(r.rutas[0].boletas.entregadas).toBe(3);
    expect(r.boletas.find((b) => b.id === '3')).toMatchObject({ estado: 'ANULADA', rutaId: '1', entregada: false });
    expect(r.resumen.entregas.boletasEntregadas).toBe(3);
  });

  it('el resumen suma rutas sin contar las paradas de rutas canceladas como pendientes', () => {
    const { resumen } = reporte();
    expect(resumen.rutas).toEqual({ total: 3, porEstado: { PLANIFICADA: 0, DESPACHADA: 1, COMPLETADA: 1, CANCELADA: 1 } });
    expect(resumen.entregas).toEqual({ paradas: 3, entregadas: 2, pendientes: 1, anuladas: 0, boletasEntregadas: 3 });
    expect(resumen.incidencias).toEqual({
      total: 4,
      porTipo: { RETRASO: 3, AVERIA_VEHICULO: 0, CLIENTE_AUSENTE: 0, DIRECCION_INCORRECTA: 0, CARGA_DANADA: 1, OTRO: 0 },
    });
    expect(resumen.reprogramaciones).toBe(1);
  });

  it('boletas: estado, ítems, cantidad con unidad, ruta vigente y entrega', () => {
    const { boletas, resumen } = reporte();
    expect(boletas[0]).toEqual({
      id: '1', numero: 'BOL-2026-00001', fecha: '2026-11-03', estado: 'EMITIDA', ordenId: '7', items: 3,
      cantidadTotal: '600.5000', unidad: 'kg', rutaId: '1', estadoRuta: 'COMPLETADA', entregada: true,
    });
    expect(boletas.find((b) => b.id === '5')).toMatchObject({ unidad: null, rutaId: '2', entregada: false });
    expect(boletas.find((b) => b.id === '6')).toMatchObject({ estado: 'BORRADOR', rutaId: null, estadoRuta: null, entregada: false });
    expect(resumen.boletas).toEqual({
      total: 6, porEstado: { BORRADOR: 1, EMITIDA: 4, ANULADA: 1 }, entregadas: 3,
      // Solo emitidas; la anulada (50 kg) y el borrador no suman.
      cantidadEmitidaPorUnidad: { caja: '12.0000', desconocida: '20.0000', kg: '1000.0000' },
    });
  });

  it('una boleta que solo estuvo en una ruta cancelada no se da por entregada', () => {
    const d = datos();
    d.ubicacionBoletas = [{ boleta_id: '1', ruta_id: '3', estado_ruta: EstadoRuta.CANCELADA, estado_entrega: ENTREGADA }];
    expect(armarReporte(FILTROS, d, GENERADO).boletas[0]).toMatchObject({ rutaId: '3', estadoRuta: 'CANCELADA', entregada: false });
  });

  it('conserva filtros, fecha de generación y avisos', () => {
    expect(reporte()).toMatchObject({ filtros: FILTROS, generadoEn: '2026-11-06T22:00:00.000Z', avisos: ['aviso de prueba'] });
  });

  it('período sin datos: todo en cero y listas vacías', () => {
    const vacio = armarReporte(FILTROS, {
      rutas: [], paradas: [], documentosRuta: [], incidencias: [], reprogramaciones: [], boletas: [], itemsBoleta: [],
      ubicacionBoletas: [], unidades: new Map(),
    }, GENERADO);
    expect(vacio.rutas).toEqual([]);
    expect(vacio.boletas).toEqual([]);
    expect(vacio.resumen).toEqual({
      rutas: { total: 0, porEstado: { PLANIFICADA: 0, DESPACHADA: 0, COMPLETADA: 0, CANCELADA: 0 } },
      entregas: { paradas: 0, entregadas: 0, pendientes: 0, anuladas: 0, boletasEntregadas: 0 },
      incidencias: { total: 0, porTipo: { RETRASO: 0, AVERIA_VEHICULO: 0, CLIENTE_AUSENTE: 0, DIRECCION_INCORRECTA: 0, CARGA_DANADA: 0, OTRO: 0 } },
      reprogramaciones: 0,
      boletas: { total: 0, porEstado: { BORRADOR: 0, EMITIDA: 0, ANULADA: 0 }, entregadas: 0, cantidadEmitidaPorUnidad: {} },
    });
  });
});
