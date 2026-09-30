import { INestApplication, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrdenesController } from './ordenes.controller';
import { OrdenesService } from './ordenes.service';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { Repository } from 'typeorm';
import { OrdenProduccion } from './entities/orden-produccion.entity';
import { HistorialEstadoOrden } from './entities/historial-estado-orden.entity';

describe('ABC-168: creación de órdenes por HTTP', () => {
  let app: INestApplication;
  let url: string;
  const crear = jest.fn();

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [OrdenesController],
      providers: [{ provide: OrdenesService, useValue: { create: crear } }],
    })
      .overrideGuard(PermisoProduccionGuard)
      .useValue({ canActivate: () => true })
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

  beforeEach(() => crear.mockReset());

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
});
