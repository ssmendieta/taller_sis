import { NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { SolicitudSalida } from './entities/solicitud-salida.entity';
import { SolicitudSalidaItem } from './entities/solicitud-salida-item.entity';
import { SolicitudesSalidaService } from './solicitudes-salida.service';

describe('SolicitudesSalidaService', () => {
  let service: SolicitudesSalidaService;
  let solicitudes: any;
  let dataSource: any;
  let manager: any;

  beforeEach(() => {
    solicitudes = { find: jest.fn(), findOne: jest.fn() };
    manager = {
      save: jest.fn(async (entity, value) => entity === SolicitudSalida ? { id: '1', ...value } : value),
      create: jest.fn((_entity, value) => value),
    };
    dataSource = {
      transaction: jest.fn(async (callback: any) => callback(manager)),
    };
    service = new SolicitudesSalidaService(
      solicitudes as unknown as Repository<SolicitudSalida>,
      dataSource as unknown as DataSource,
    );
  });

  it('guarda cabecera e ítems en una sola transacción y fija estado y responsable', async () => {
    const dto = {
      ordenId: '7', destinoDocumental: 'Archivo', motivo: 'Revisión',
      items: [{ referencia: 'L-2', cantidad: '10.0001' }],
    };
    const result = await service.create(dto, '12345678901234567');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenNthCalledWith(1, SolicitudSalida, expect.objectContaining({
      estado: 'BORRADOR', responsableUsuarioId: '12345678901234567', ordenId: '7',
    }));
    expect(manager.save).toHaveBeenNthCalledWith(2, SolicitudSalidaItem, [expect.objectContaining({
      solicitudId: '1', cantidad: '10.0001', referencia: 'L-2',
    })]);
    expect(result.items).toHaveLength(1);
  });

  it('propaga errores de escritura para que la transacción haga rollback', async () => {
    const failure = new Error('falló la escritura de ítems');
    manager.save.mockImplementationOnce(async (_entity, value) => ({ id: '1', ...value }));
    manager.save.mockRejectedValueOnce(failure);
    dataSource.transaction!.mockImplementation(async (callback: any) => callback(manager));
    await expect(service.create({
      ordenId: '7', destinoDocumental: 'Archivo', motivo: 'Revisión',
      items: [{ referencia: 'L-2', cantidad: '1.0000' }],
    }, '2')).rejects.toBe(failure);
  });

  it('consulta registros persistidos con sus ítems', async () => {
    const rows = [{ id: '1', items: [] }];
    solicitudes.find!.mockResolvedValue(rows as SolicitudSalida[]);
    await expect(service.findAll()).resolves.toBe(rows);
    expect(solicitudes.find).toHaveBeenCalledWith(expect.objectContaining({ relations: { items: true } }));
  });

  it('devuelve una solicitud individual y rechaza ids inválidos o inexistentes', async () => {
    const row = { id: '1', items: [] } as SolicitudSalida;
    solicitudes.findOne!.mockResolvedValue(row);
    await expect(service.findOne('1')).resolves.toBe(row);
    await expect(service.findOne('0')).rejects.toBeInstanceOf(NotFoundException);
    solicitudes.findOne!.mockResolvedValue(null);
    await expect(service.findOne('2')).rejects.toBeInstanceOf(NotFoundException);
  });
});
