import test from 'node:test';
import assert from 'node:assert/strict';

const formato = await import('../frontend/src/utils/formato.js');
const ordenes = await import('../frontend/src/utils/ordenes.js');
const permisos = await import('../frontend/src/services/permisos.js');

const encargado = { permisos: ['ordenes.crear', 'ordenes.consultar', 'ordenes.cambiar_estado', 'ordenes.iniciar', 'ordenes.registrar_avance', 'ordenes.finalizar_cancelar', 'recetas.gestionar'] };
const supervisor = { permisos: ['ordenes.consultar'] };

test('menu por rol: supervisor solo consulta, encargado opera', () => {
  assert.equal(permisos.tienePermiso(supervisor, 'ordenes.consultar'), true);
  assert.equal(permisos.tienePermiso(supervisor, 'ordenes.crear'), false);
  assert.equal(ordenes.puedeVerAcciones(supervisor), false);
  assert.equal(ordenes.puedeVerAcciones(encargado), true);
  assert.equal(ordenes.puedeCrear(supervisor), false);
  assert.equal(ordenes.puedeCrear(encargado), true);
});

test('acciones contextuales por estado (PENDIENTE->PLANIFICADA existe)', () => {
  assert.deepEqual(ordenes.TRANSICIONES.PENDIENTE, ['PLANIFICADA', 'CANCELADA']);
  const acc = ordenes.accionesPara(encargado, 'PENDIENTE').map((a) => a.destino);
  assert.deepEqual(acc, ['PLANIFICADA', 'CANCELADA']);
  assert.deepEqual(ordenes.accionesPara(encargado, 'FINALIZADA'), []);
  assert.equal(ordenes.accionesPara(supervisor, 'PLANIFICADA').every((a) => !a.permitida), true);
});

test('formato: cantidades, fechas, historial y materiales', () => {
  assert.equal(formato.mostrarCantidad('2.5000'), '2,5');
  assert.equal(formato.mostrarCantidad(null), '—');
  assert.equal(formato.mostrarFecha('2026-09-30T00:00:00Z'), '2026-09-30');
  assert.equal(formato.nombreProductoOrden({ producto_nombre: 'Pan' }), 'Pan');
  assert.equal(formato.nombreProductoOrden({ producto: { nombre: 'Pan' } }), 'Pan');
  assert.equal(formato.totalProducidoDe({ total: 3 }), 3);
  assert.equal(formato.totalProducidoDe({ acumulado: 4 }), 4);
  const h = formato.historialNormalizado([{ estado_anterior: null, estado_nuevo: 'PENDIENTE', usuario_responsable_nombre: 'Ana', fecha_hora: '2026-09-30T10:00:00Z', motivo: null }]);
  assert.equal(h[0].anterior, null);
  assert.equal(h[0].usuario, 'Ana');
  const m = formato.materialesNormalizados({ materiales: [{ material_id: 2, codigo: 'AZU-001', cantidad_requerida: 50, cantidad_disponible: 5, estado: 'INSUFICIENTE' }] });
  assert.equal(m[0].estado, 'INSUFICIENTE');
});
