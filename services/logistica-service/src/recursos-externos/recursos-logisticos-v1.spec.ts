import { readFileSync } from 'fs';
import * as path from 'path';
import {
  EJEMPLO_RESPUESTA_RECURSOS_V1,
  ErpRecursosNoDisponibleError,
  MAX_ID_EXTERNO,
  RECURSOS_LOGISTICOS_V1,
  RUTA_ERP_RECURSOS_V1,
  TIMEOUT_ERP_RECURSOS_MS,
  motivoPorEstadoHttp,
} from './dto/recursos-logisticos-v1';
import {
  RespuestaRecursosV1InvalidaError,
  compararCapacidad,
  esFechaValida,
  validarRespuestaRecursosV1,
} from './dto/recursos-logisticos-v1.validator';

const DOCUMENTO = path.resolve(__dirname, '../../../../docs/integraciones/recursos-logisticos-v1.md');
const FECHA = EJEMPLO_RESPUESTA_RECURSOS_V1.fecha;
const copia = () => JSON.parse(JSON.stringify(EJEMPLO_RESPUESTA_RECURSOS_V1));

function errores(cuerpo: unknown, fecha = FECHA) {
  try {
    validarRespuestaRecursosV1(cuerpo, fecha);
  } catch (error) {
    expect(error).toBeInstanceOf(RespuestaRecursosV1InvalidaError);
    return (error as RespuestaRecursosV1InvalidaError).errores;
  }
  throw new Error('La respuesta debía rechazarse');
}

describe('ABC-350: contrato recursos-logisticos v1 con el ERP', () => {
  it('el ejemplo del documento es el mismo del código y cumple el contrato', () => {
    const documento = readFileSync(DOCUMENTO, 'utf8');
    const bloque = documento.split('## Respuesta correcta (200)')[1].match(/```json\n([\s\S]*?)```/)[1];
    expect(JSON.parse(bloque)).toEqual(EJEMPLO_RESPUESTA_RECURSOS_V1);
    expect(validarRespuestaRecursosV1(copia(), FECHA)).toEqual(EJEMPLO_RESPUESTA_RECURSOS_V1);
  });

  it('documenta endpoint, versión y timeout sin credenciales', () => {
    const documento = readFileSync(DOCUMENTO, 'utf8');
    expect(documento).toContain(`GET {ERP_RECURSOS_URL}${RUTA_ERP_RECURSOS_V1}?fecha=`);
    expect(documento).toContain(RECURSOS_LOGISTICOS_V1);
    expect(documento).toContain(`${TIMEOUT_ERP_RECURSOS_MS} ms`);
    expect(documento).not.toMatch(/Bearer\s+(?!<)[A-Za-z0-9._-]{8,}/);
    expect(documento).not.toMatch(/ERP_RECURSOS_TOKEN\s*=\s*\S/);
  });

  it('identifica recursos por idExterno y muestra capacidad con unidad', () => {
    const respuesta = validarRespuestaRecursosV1(copia(), FECHA);
    expect(respuesta.vehiculos.map((v) => `${v.idExterno} ${v.capacidad.valor} ${v.capacidad.unidad}`))
      .toEqual(['VEH-01 1500.0000 kg', 'VEH-02 800.0000 kg']);
    expect(respuesta.choferes.map((c) => c.idExterno)).toEqual(['CHO-12', 'CHO-07']);
  });

  it('ignora campos adicionales del ERP y no los conserva', () => {
    const cuerpo = copia();
    cuerpo.costoInterno = 999;
    cuerpo.vehiculos[0].gps = { lat: 1, lng: 2 };
    const respuesta = validarRespuestaRecursosV1(cuerpo, FECHA);
    expect(respuesta).not.toHaveProperty('costoInterno');
    expect(respuesta.vehiculos[0]).not.toHaveProperty('gps');
  });

  it('completa con null la descripción y la licencia ausentes', () => {
    const cuerpo = copia();
    delete cuerpo.vehiculos[0].descripcion;
    delete cuerpo.choferes[0].licenciaCategoria;
    const respuesta = validarRespuestaRecursosV1(cuerpo, FECHA);
    expect(respuesta.vehiculos[0].descripcion).toBeNull();
    expect(respuesta.choferes[0].licenciaCategoria).toBeNull();
  });

  it.each([
    ['versión distinta', (c) => { c.version = 'recursos-logisticos.v2'; }, 'version'],
    ['fecha de otro día', (c) => { c.fecha = '2026-11-11'; }, 'fecha'],
    ['fecha imposible', (c) => { c.fecha = '2026-02-30'; }, 'fecha'],
    ['generadoEn inválido', (c) => { c.generadoEn = 'ayer'; }, 'generadoEn'],
    ['vehiculos no es lista', (c) => { c.vehiculos = {}; }, 'vehiculos'],
    ['vehículo sin idExterno', (c) => { delete c.vehiculos[0].idExterno; }, 'vehiculos[0].idExterno'],
    ['idExterno con espacios', (c) => { c.vehiculos[0].idExterno = ' VEH-01'; }, 'vehiculos[0].idExterno'],
    ['idExterno de 81 caracteres', (c) => { c.vehiculos[0].idExterno = 'V'.repeat(MAX_ID_EXTERNO + 1); }, 'vehiculos[0].idExterno'],
    ['vehículo duplicado', (c) => { c.vehiculos[1].idExterno = 'VEH-01'; }, 'vehiculos[1].idExterno'],
    ['chofer duplicado', (c) => { c.choferes[1].idExterno = 'CHO-12'; }, 'choferes[1].idExterno'],
    ['placa vacía', (c) => { c.vehiculos[0].placa = '  '; }, 'vehiculos[0].placa'],
    ['capacidad cero', (c) => { c.vehiculos[0].capacidad.valor = '0'; }, 'vehiculos[0].capacidad.valor'],
    ['capacidad negativa', (c) => { c.vehiculos[0].capacidad.valor = '-5'; }, 'vehiculos[0].capacidad.valor'],
    ['capacidad con 5 decimales', (c) => { c.vehiculos[0].capacidad.valor = '1.00001'; }, 'vehiculos[0].capacidad.valor'],
    ['capacidad como número', (c) => { c.vehiculos[0].capacidad.valor = 1500; }, 'vehiculos[0].capacidad.valor'],
    ['unidad de capacidad desconocida', (c) => { c.vehiculos[0].capacidad.unidad = 'toneladas'; }, 'vehiculos[0].capacidad.unidad'],
    ['vehículo sin capacidad', (c) => { delete c.vehiculos[0].capacidad; }, 'vehiculos[0].capacidad'],
    ['disponible como texto', (c) => { c.vehiculos[0].disponible = 'true'; }, 'vehiculos[0].disponible'],
    ['chofer sin nombre', (c) => { c.choferes[0].nombre = ''; }, 'choferes[0].nombre'],
    ['licencia demasiado larga', (c) => { c.choferes[0].licenciaCategoria = 'X'.repeat(11); }, 'choferes[0].licenciaCategoria'],
  ])('rechaza la respuesta completa: %s', (_caso, alterar: (c: any) => void, campo) => {
    const cuerpo = copia();
    alterar(cuerpo);
    expect(errores(cuerpo).map((e) => e.campo)).toContain(campo);
  });

  it('acumula todos los errores en vez de detenerse en el primero', () => {
    const cuerpo = copia();
    cuerpo.vehiculos[0].capacidad.valor = '0';
    cuerpo.choferes[0].disponible = 1;
    expect(errores(cuerpo).map((e) => e.campo)).toEqual(['vehiculos[0].capacidad.valor', 'choferes[0].disponible']);
  });

  it('un cuerpo que no es objeto JSON se rechaza', () => {
    expect(errores(null)).toEqual([{ campo: '$', motivo: 'debe ser un objeto JSON' }]);
    expect(errores([])).toEqual([{ campo: '$', motivo: 'debe ser un objeto JSON' }]);
  });

  it.each([
    [200, null],
    [401, 'CREDENCIALES'],
    [403, 'CREDENCIALES'],
    [400, 'SOLICITUD_RECHAZADA'],
    [404, 'SOLICITUD_RECHAZADA'],
    [500, 'NO_DISPONIBLE'],
    [503, 'NO_DISPONIBLE'],
  ])('clasifica HTTP %i del ERP como %s', (status, motivo) => {
    expect(motivoPorEstadoHttp(status)).toBe(motivo);
  });

  it('el error de indisponibilidad conserva el motivo para decidir el respaldo', () => {
    const error = new ErpRecursosNoDisponibleError('TIMEOUT', 'sin respuesta en 3000 ms');
    expect(error.motivo).toBe('TIMEOUT');
    expect(error.message).toBe('Recursos del ERP no disponibles (TIMEOUT): sin respuesta en 3000 ms');
  });

  it.each([
    [{ valor: '1500.0000', unidad: 'kg' }, { valor: '1500', unidad: 'kg' }, 'SUFICIENTE'],
    [{ valor: '1500.0000', unidad: 'kg' }, { valor: '1500.0001', unidad: 'kg' }, 'INSUFICIENTE'],
    [{ valor: '0.3', unidad: 'kg' }, { valor: '0.1', unidad: 'kg' }, 'SUFICIENTE'],
    [{ valor: '1500.0000', unidad: 'kg' }, { valor: '10', unidad: 'l' }, 'UNIDAD_INCOMPATIBLE'],
  ] as const)('compara capacidad %j con lo requerido %j → %s', (disponible, requerida, esperado) => {
    expect(compararCapacidad(disponible, requerida)).toBe(esperado);
  });

  it.each([['2026-11-10', true], ['2026-02-29', false], ['2028-02-29', true], ['10/11/2026', false], [20261110, false]])(
    'valida la fecha de consulta %s → %s', (fecha, esperado) => {
      expect(esFechaValida(fecha)).toBe(esperado);
    },
  );
});
