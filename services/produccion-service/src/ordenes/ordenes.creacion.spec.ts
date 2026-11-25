import {
  ConflictException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrdenesController } from './ordenes.controller';
import { OrdenesService } from './ordenes.service';
import { MaterialCalculationService } from '../material-calculation/material-calculation.service';
import { PERMISO_PRODUCCION, PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { Repository } from 'typeorm';
import { OrdenProduccion } from './entities/orden-produccion.entity';
import { HistorialEstadoOrden } from './entities/historial-estado-orden.entity';

describe('ABC-168: creación de órdenes por HTTP', () => {
  let app: INestApplication;
  let url: string;
  const crear = jest.fn();
  const crearDesdeDemanda = jest.fn();
  let permitirAcceso = true;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [OrdenesController],
      providers: [
        { provide: OrdenesService, useValue: { create: crear, crearDesdeDemanda } },
        { provide: MaterialCalculationService, useValue: {} },
      ],
    })
      .overrideGuard(PermisoProduccionGuard)
      .useValue({
        canActivate: () => {
          if (!permitirAcceso) throw new ForbiddenException('Sin permiso');
          return true;
        },
      })
      .compile();

    app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    crear.mockReset();
    crearDesdeDemanda.mockReset();
    permitirAcceso = true;
  });

  async function enviarOrden(body: Record<string, unknown>) {
    const respuesta = await fetch(`${url}/ordenes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: respuesta.status, datos: await respuesta.json() };
  }

  const ordenValida = {
    producto_id: 2,
    cantidad: 12.5,
    fecha_programada: '2026-10-01',
    responsable_id: 7,
  };

  it('confirma una orden válida y entrega el identificador guardado', async () => {
    const guardada = { id: 10, codigo: 'ORD-2026-00010', ...ordenValida, estado: 'PENDIENTE' };
    crear.mockResolvedValue(guardada);

    const respuesta = await enviarOrden(ordenValida);

    expect(respuesta.status).toBe(201);
    expect(respuesta.datos).toEqual(guardada);
    expect(crear).toHaveBeenCalledWith(ordenValida, undefined);
  });

  it('rechaza una orden incompleta sin llamar al servicio', async () => {
    const respuesta = await enviarOrden({ cantidad: 12.5, fecha_programada: '2026-10-01' });

    expect(respuesta.status).toBe(400);
    expect(crear).not.toHaveBeenCalled();
  });

  it.each([0, -1, 'doce'])('rechaza cantidad inválida %s', async (cantidad) => {
    const respuesta = await enviarOrden({ ...ordenValida, cantidad });

    expect(respuesta.status).toBe(400);
    expect(crear).not.toHaveBeenCalled();
  });

  it('informa un error del servicio y no confirma la creación', async () => {
    crear.mockRejectedValue(new ServiceUnavailableException('Servicio de datos no disponible'));

    const respuesta = await enviarOrden(ordenValida);

    expect(respuesta.status).toBe(503);
    expect(respuesta.datos.message).toBe('Servicio de datos no disponible');
  });

  it('genera códigos legibles ORD-AAAA-NNNNN sin colisiones', async () => {
    let secuencia = 0;
    const ordenes = {
      query: async () => [{ n: String((secuencia += 1)) }],
      manager: {
        transaction: async (fn: (m: any) => Promise<unknown>) =>
          fn({
            create: (_t: unknown, v: object) => v,
            save: async (_t: unknown, v: object) => ({ id: secuencia, ...v }),
          }),
      },
    } as unknown as Repository<OrdenProduccion>;
    const recetas = { findOne: async () => ({ id: 2, activa: true }) } as any;
    const servicio = new OrdenesService(ordenes, {} as Repository<HistorialEstadoOrden>, {} as any, recetas);
    const actor = { sub: 7, rolNombre: 'Encargado de Producción', nombre: 'Ana' };
    const primera = await servicio.create({ ...ordenValida, fecha_programada: '2099-10-01' } as any, actor);
    const segunda = await servicio.create({ ...ordenValida, fecha_programada: '2099-10-01' } as any, actor);
    expect(primera.codigo).not.toBe(segunda.codigo);
    expect(primera.codigo).toMatch(/^ORD-\d{4}-\d{5}$/);
  });

  it('ABC-444: POST /ordenes/desde-demanda/:demandaId exige permiso ordenes.crear y delega al servicio', async () => {
    const permiso = Reflect.getMetadata(PERMISO_PRODUCCION, OrdenesController.prototype.crearDesdeDemanda);
    expect(permiso).toBe('ordenes.crear');

    const ordenCreada = { id: 25, codigo: 'ORD-2026-00025', producto_id: 4, cantidad: 15, fecha_programada: '2099-12-10', demanda_id: '42' };
    crearDesdeDemanda.mockResolvedValue(ordenCreada);

    const ok = await fetch(`${url}/ordenes/desde-demanda/42`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual(ordenCreada);
    expect(crearDesdeDemanda).toHaveBeenCalledWith('42', {}, undefined);

    permitirAcceso = false;
    const denegado = await fetch(`${url}/ordenes/desde-demanda/42`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(denegado.status).toBe(403);
  });

  it('ABC-444: crea orden heredando producto, cantidad y fecha requerida desde una demanda confirmada', async () => {
    let secuencia = 0;
    const ordenes = {
      query: async () => [{ n: String((secuencia += 1)) }],
      manager: {
        transaction: async (fn: (m: any) => Promise<unknown>) =>
          fn({
            create: (_t: unknown, v: object) => v,
            save: async (_t: unknown, v: object) => ({ id: 99, ...v }),
          }),
      },
    } as unknown as Repository<OrdenProduccion>;
    const recetas = {
      findActivaPorProductoCodigo: jest.fn().mockResolvedValue({ id: 7, productoCodigo: 'PAN-001', activa: true }),
    } as any;
    const demandaService = {
      obtenerParaOrden: jest.fn().mockResolvedValue({
        id: '42',
        estado: 'CONFIRMADA',
        fechaRequerida: '2099-12-15',
        items: [{ productoCodigo: 'PAN-001', cantidad: '25.5000', unidad: 'kg' }],
      }),
    } as any;

    const servicio = new OrdenesService(ordenes, {} as Repository<HistorialEstadoOrden>, {} as any, recetas, demandaService);
    const actor = { sub: 7, rolNombre: 'Encargado de Producción', nombre: 'Ana' };
    const orden = await servicio.crearDesdeDemanda('42', undefined, actor);

    expect(demandaService.obtenerParaOrden).toHaveBeenCalledWith('42');
    expect(recetas.findActivaPorProductoCodigo).toHaveBeenCalledWith('PAN-001');
    expect(orden).toMatchObject({
      producto_id: 7,
      cantidad: 25.5,
      fecha_programada: '2099-12-15',
      estado: 'PENDIENTE',
      demanda_id: '42',
      responsable_id: 7,
    });
  });

  it('ABC-444: rechaza demanda inexistente (404) o no confirmada (409)', async () => {
    const recetas = { findActivaPorProductoCodigo: jest.fn() } as any;
    const demandaService = {
      obtenerParaOrden: jest
        .fn()
        .mockRejectedValueOnce(new NotFoundException('Demanda con id 999 no encontrada'))
        .mockRejectedValueOnce(new ConflictException('Solo se pueden crear órdenes desde demandas confirmadas')),
    } as any;

    const servicio = new OrdenesService({} as any, {} as any, {} as any, recetas, demandaService);
    const actor = { sub: 7, rolNombre: 'Encargado de Producción', nombre: 'Ana' };

    await expect(servicio.crearDesdeDemanda('999', undefined, actor)).rejects.toThrow(NotFoundException);
    await expect(servicio.crearDesdeDemanda('10', undefined, actor)).rejects.toThrow(ConflictException);
    expect(recetas.findActivaPorProductoCodigo).not.toHaveBeenCalled();
  });
});
