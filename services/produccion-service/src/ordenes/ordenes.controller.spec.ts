import { Test, TestingModule } from '@nestjs/testing';
import { OrdenesController } from './ordenes.controller';
import { OrdenesService } from './ordenes.service';

describe('OrdenesController (ABC-144)', () => {
  let controller: OrdenesController;

  const ordenesServiceMock = {
    findAll: jest.fn(),
    findByCodigo: jest.fn(),
    buscar: jest.fn(),
    obtenerHistorial: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdenesController],
      providers: [{ provide: OrdenesService, useValue: ordenesServiceMock }],
    }).compile();

    controller = module.get<OrdenesController>(OrdenesController);
  });

  it('GET /ordenes delega el listado general al servicio', async () => {
    const ordenes = [{ id: 1, codigo: 'OP-001' }];
    ordenesServiceMock.findAll.mockResolvedValue(ordenes);

    await expect(controller.findAll()).resolves.toBe(ordenes);
    expect(ordenesServiceMock.findAll).toHaveBeenCalledTimes(1);
  });

  it('GET /ordenes/codigo/:codigo delega el código exacto al servicio', async () => {
    const orden = { id: 1, codigo: 'OP-001' };
    ordenesServiceMock.findByCodigo.mockResolvedValue(orden);

    await expect(controller.findByCodigo('OP-001')).resolves.toBe(orden);
    expect(ordenesServiceMock.findByCodigo).toHaveBeenCalledWith('OP-001');
  });

  it('conserva la delegación de GET /ordenes/buscar', async () => {
    ordenesServiceMock.buscar.mockResolvedValue([]);

    await expect(
      controller.buscar('PLANIFICADA', 'OP-00', '2026-10-01'),
    ).resolves.toEqual([]);
    expect(ordenesServiceMock.buscar).toHaveBeenCalledWith(
      'PLANIFICADA',
      'OP-00',
      '2026-10-01',
    );
  });

  it('conserva la delegación del endpoint de historial existente', async () => {
    const historial = [{ estadoAnterior: 'PENDIENTE', estadoNuevo: 'PLANIFICADA' }];
    ordenesServiceMock.obtenerHistorial.mockResolvedValue(historial);

    await expect(controller.obtenerHistorial(1)).resolves.toBe(historial);
    expect(ordenesServiceMock.obtenerHistorial).toHaveBeenCalledWith(1);
  });
});
