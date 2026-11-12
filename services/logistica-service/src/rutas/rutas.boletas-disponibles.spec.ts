import { BadRequestException } from '@nestjs/common';
import { PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { PERMISO_CONSULTAR_RUTAS, RutasController } from './rutas.controller';
import { RutasService } from './rutas.service';

// ABC-372: boletas EMITIDAS que ninguna ruta activa tiene (prueba con base simulada).
describe('boletas disponibles para planificar rutas', () => {
  let dataSource: { query: jest.Mock };
  let service: RutasService;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => [{ id: '7', numero: 'BOL-7', solicitudSalidaId: '3', productoCodigo: 'PAN-01', unidad: 'kg' }]) };
    service = new RutasService({} as any, dataSource as any, {} as any);
  });

  it('consulta solo boletas EMITIDAS sin ruta PLANIFICADA ni DESPACHADA', async () => {
    const boletas = await service.findBoletasDisponibles();
    expect(boletas).toEqual([{ id: '7', numero: 'BOL-7', solicitudSalidaId: '3', productoCodigo: 'PAN-01', unidad: 'kg' }]);
    const [sql, parametros] = dataSource.query.mock.calls[0];
    expect(sql).toContain('boleta.estado = $1');
    expect(sql).toContain('NOT EXISTS');
    expect(parametros).toEqual(['EMITIDA', ['PLANIFICADA', 'DESPACHADA'], null]);
  });

  it('con rutaId conserva las boletas de esa ruta para poder editarla', async () => {
    await service.findBoletasDisponibles('9');
    expect(dataSource.query.mock.calls[0][1][2]).toBe('9');
    expect(dataSource.query.mock.calls[0][0]).toContain('ruta.id <> $3::bigint');
  });

  it.each(['abc', '0', '-1', '1.5', '99999999999999999999'])('rechaza el rutaId inválido %s sin consultar', async (rutaId) => {
    await expect(service.findBoletasDisponibles(rutaId)).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('el controlador delega, exige consultar rutas y trata rutaId vacío como ausente', async () => {
    const delegado = { findBoletasDisponibles: jest.fn(async () => []) };
    const controller = new RutasController(delegado as any);
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, RutasController.prototype.findBoletasDisponibles)).toBe(PERMISO_CONSULTAR_RUTAS);
    await controller.findBoletasDisponibles('');
    await controller.findBoletasDisponibles('4');
    expect(delegado.findBoletasDisponibles).toHaveBeenNthCalledWith(1, null);
    expect(delegado.findBoletasDisponibles).toHaveBeenNthCalledWith(2, '4');
  });

  it('se declara antes de :id para que no se interprete como identificador', () => {
    const orden = Object.getOwnPropertyNames(RutasController.prototype);
    expect(orden.indexOf('findBoletasDisponibles')).toBeLessThan(orden.indexOf('findOne'));
  });
});
