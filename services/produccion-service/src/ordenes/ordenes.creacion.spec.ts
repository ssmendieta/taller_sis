import { INestApplication, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrdenesController } from './ordenes.controller';
import { OrdenesService } from './ordenes.service';

describe('ABC-168: creación de órdenes por HTTP', () => {
  let app: INestApplication;
  let url: string;
  const crear = jest.fn();

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [OrdenesController],
      providers: [{ provide: OrdenesService, useValue: { create: crear } }],
    }).compile();

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
    const guardada = { id: 10, codigo: 'ORD-123', ...ordenValida, estado: 'PENDIENTE' };
    crear.mockResolvedValue(guardada);

    const respuesta = await enviarOrden(ordenValida);

    expect(respuesta.status).toBe(201);
    expect(respuesta.datos).toEqual(guardada);
    expect(crear).toHaveBeenCalledWith(ordenValida);
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
});
