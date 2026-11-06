import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { getMetadataArgsStorage } from 'typeorm';
import { PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { ObservacionesDespachoEntrega1710000000008 } from '../database/migrations/1710000000008-ObservacionesDespachoEntrega';
import { RutaParada } from '../rutas/entities/ruta-parada.entity';
import { Ruta } from '../rutas/entities/ruta.entity';
import { DespachoController } from './despacho.controller';
import { ValidarObservacionPipe } from './dto/validar-observacion.pipe';

describe('ABC-376: DespachoController', () => {
  it('protege despacho y entrega con logistica.rutas.gestionar', () => {
    expect(Reflect.getMetadata('__guards__', DespachoController)).toHaveLength(1);
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, DespachoController.prototype.despachar)).toBe('logistica.rutas.gestionar');
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, DespachoController.prototype.entregar)).toBe('logistica.rutas.gestionar');
  });

  it('toma el autor de la sesión, no del cuerpo', async () => {
    const service = { despachar: jest.fn().mockResolvedValue({}), entregar: jest.fn().mockResolvedValue({}) };
    const controller = new DespachoController(service as any);
    await controller.despachar('9', { observacion: 'ok' }, { usuarioId: '42' });
    await controller.entregar('9', '10', { observacion: null }, { usuarioId: '42' });
    expect(service.despachar).toHaveBeenCalledWith('9', '42', 'ok');
    expect(service.entregar).toHaveBeenCalledWith('9', '10', '42', null);
  });
});

describe('ABC-376: ValidarObservacionPipe', () => {
  const pipe = new ValidarObservacionPipe();

  it.each([
    [undefined, null],
    [{}, null],
    [{ observacion: null }, null],
    [{ observacion: '   ' }, null],
    [{ observacion: '  Recibió Ana  ' }, 'Recibió Ana'],
    [{ observacion: 'x'.repeat(500) }, 'x'.repeat(500)],
  ])('%j → observacion %j', (cuerpo, esperado) => {
    expect(pipe.transform(cuerpo)).toEqual({ observacion: esperado });
  });

  it.each([
    [{ observacion: 'x'.repeat(501) }, 'hasta 500 caracteres'],
    [{ observacion: 5 }, 'hasta 500 caracteres'],
    [{ observacion: 'ok', fecha: '2026-01-01' }, 'Campos no permitidos: fecha'],
    [{ usuarioId: '1' }, 'Campos no permitidos: usuarioId'],
    [{ estado: 'ENTREGADA' }, 'Campos no permitidos: estado'],
    [['observacion'], 'debe ser un objeto'],
  ])('rechaza %j', (cuerpo, mensaje) => {
    expect(() => pipe.transform(cuerpo)).toThrow(BadRequestException);
    expect(() => pipe.transform(cuerpo)).toThrow(mensaje);
  });
});

describe('ABC-376: observación del despacho y de la entrega en el modelo', () => {
  it('las entidades declaran las columnas y sus restricciones', () => {
    const { columns, checks } = getMetadataArgsStorage();
    expect(columns.some((c) => c.target === Ruta && c.propertyName === 'despachoObservacion')).toBe(true);
    expect(columns.some((c) => c.target === RutaParada && c.propertyName === 'entregaObservacion')).toBe(true);
    expect(checks.map((c) => c.name)).toEqual(expect.arrayContaining([
      'ck_ruta_despacho_observacion', 'ck_ruta_parada_entrega_observacion',
    ]));
  });

  it('la migración agrega y quita las columnas con sus CHECK', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migracion = new ObservacionesDespachoEntrega1710000000008();
    await migracion.up({ query } as any);
    const subida = query.mock.calls.map(([sql]) => sql).join('\n');
    expect(subida).toContain('ADD COLUMN despacho_observacion VARCHAR(500) NULL');
    expect(subida).toContain('ADD COLUMN entrega_observacion VARCHAR(500) NULL');
    expect(subida).toContain('ck_ruta_despacho_observacion');
    expect(subida).toContain('ck_ruta_parada_entrega_observacion');
    query.mockClear();
    await migracion.down({ query } as any);
    const bajada = query.mock.calls.map(([sql]) => sql).join('\n');
    expect(bajada).toContain('DROP COLUMN despacho_observacion');
    expect(bajada).toContain('DROP COLUMN entrega_observacion');
  });
});
