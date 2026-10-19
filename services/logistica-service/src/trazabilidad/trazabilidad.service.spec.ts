import { NotFoundException } from '@nestjs/common';
import { EstadoBoleta } from '../boletas/entities/estado-boleta.enum';
import { TrazabilidadService } from './trazabilidad.service';

describe('TrazabilidadService', () => {
  let service: TrazabilidadService;
  let qbMock: any;
  let boletasRepoMock: any;
  let produccionMock: any;

  beforeEach(() => {
    qbMock = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    boletasRepoMock = {
      createQueryBuilder: jest.fn().mockReturnValue(qbMock),
    };

    produccionMock = {
      consultarOrdenPorCodigo: jest.fn(),
      consultarOrdenPorId: jest.fn(),
    };

    service = new TrazabilidadService(boletasRepoMock, produccionMock);
  });

  it('retorna arreglo vacío cuando no se proporciona ningún criterio de búsqueda', async () => {
    const resultado = await service.consultar({});
    expect(resultado).toEqual([]);
    expect(boletasRepoMock.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('construye la consulta base con la cadena relacional correcta y limita a 50 registros', async () => {
    await service.consultar({ q: 'Almacen' });

    expect(boletasRepoMock.createQueryBuilder).toHaveBeenCalledWith('boleta');
    expect(qbMock.innerJoinAndSelect).toHaveBeenCalledWith('boleta.solicitudSalida', 'solicitud');
    expect(qbMock.leftJoinAndSelect).toHaveBeenCalledWith('boleta.items', 'item');
    expect(qbMock.leftJoinAndSelect).toHaveBeenCalledWith('boleta.historial', 'historial');
    expect(qbMock.orderBy).toHaveBeenCalledWith('boleta.creadoEn', 'DESC');
    expect(qbMock.addOrderBy).toHaveBeenCalledWith('boleta.id', 'DESC');
    expect(qbMock.take).toHaveBeenCalledWith(50);
  });

  it('filtra por ordenId numérico directamente en solicitud.orden_id', async () => {
    await service.consultar({ ordenId: '8' });

    expect(qbMock.andWhere).toHaveBeenCalledWith('solicitud.orden_id = :ordenId', { ordenId: '8' });
    expect(produccionMock.consultarOrdenPorCodigo).not.toHaveBeenCalled();
  });

  it('resuelve ordenId textual a través de Producción si no es numérico', async () => {
    produccionMock.consultarOrdenPorCodigo.mockResolvedValue({ id: '8', codigo: 'ORD-7' });

    await service.consultar({ ordenId: 'ORD-7' }, 'Bearer token');

    expect(produccionMock.consultarOrdenPorCodigo).toHaveBeenCalledWith('ORD-7', 'Bearer token');
    expect(qbMock.andWhere).toHaveBeenCalledWith('solicitud.orden_id = :ordenId', { ordenId: '8' });
  });

  it('devuelve arreglo vacío si la orden textual no existe en Producción', async () => {
    produccionMock.consultarOrdenPorCodigo.mockRejectedValue(new NotFoundException('Orden no encontrada'));

    const resultado = await service.consultar({ ordenId: 'ORD-999' }, 'Bearer token');

    expect(resultado).toEqual([]);
    expect(qbMock.getMany).not.toHaveBeenCalled();
  });

  it('filtra por boletaId', async () => {
    await service.consultar({ boletaId: '10' });

    expect(qbMock.andWhere).toHaveBeenCalledWith('boleta.id = :boletaId', { boletaId: '10' });
  });

  it('filtra por loteId buscando la referencia en los items', async () => {
    await service.consultar({ loteId: 'L-7' });

    expect(qbMock.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('EXISTS (SELECT 1 FROM boletas_envio_items'),
      { loteId: 'L-7' },
    );
  });

  it('filtra por búsqueda general q aplicando condiciones OR', async () => {
    await service.consultar({ q: 'Almacen' });

    expect(qbMock.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('boleta.numero ILIKE :qLike'),
      expect.objectContaining({ qLike: '%Almacen%' }),
    );
  });

  it('incluye condiciones numéricas cuando q es un número', async () => {
    await service.consultar({ q: '42' });

    expect(qbMock.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('boleta.id = :qNum'),
      expect.objectContaining({ qLike: '%42%', qNum: '42' }),
    );
  });

  it('mapea correctamente estados BORRADOR, EMITIDA y ANULADA distinguiendo el historial', async () => {
    const fechaCreacion = new Date('2026-10-18T14:00:00Z');
    const fechaAnulacion = new Date('2026-10-18T16:00:00Z');

    const boletaMock = {
      id: '1',
      numero: 'BOL-2026-00001',
      estado: EstadoBoleta.ANULADA,
      solicitudSalidaId: '1',
      creadoEn: fechaCreacion,
      solicitudSalida: {
        id: '1',
        ordenId: '8',
        destinoDocumental: 'Almacén Central B',
      },
      items: [
        { id: '101', referencia: 'L-7', cantidad: '10.0000' },
        { id: '102', referencia: 'L-7', cantidad: '5.0000' },
      ],
      historial: [
        {
          id: '201',
          estadoAnterior: EstadoBoleta.EMITIDA,
          estadoNuevo: EstadoBoleta.ANULADA,
          usuarioActorId: '3',
          motivo: 'Dirección de destino incorrecta',
          fechaHora: fechaAnulacion,
        },
      ],
    };

    qbMock.getMany.mockResolvedValue([boletaMock]);
    produccionMock.consultarOrdenPorId.mockResolvedValue({ id: '8', codigo: 'ORD-7' });

    const resultado = await service.consultar({ boletaId: '1' }, 'Bearer token');

    expect(resultado).toHaveLength(1);
    const item = resultado[0];

    expect(item.id).toBe('1');
    expect(item.boletaId).toBe('1');
    expect(item.numero).toBe('BOL-2026-00001');
    expect(item.ordenId).toBe('8');
    expect(item.orden).toBe('ORD-7');
    expect(item.destino).toBe('Almacén Central B');
    expect(item.cantidad).toBe('15.0000');
    expect(item.lote).toBe('L-7');
    expect(item.loteCodigo).toBe('L-7');
    expect(item.loteId).toBe('L-7');
    expect(item.estado).toBe(EstadoBoleta.ANULADA);

    expect(item.items).toHaveLength(2);
    expect(item.items[0]).toEqual({
      id: '101',
      referencia: 'L-7',
      lote: 'L-7',
      cantidad: '10.0000',
    });

    expect(item.historial).toHaveLength(1);
    expect(item.historial[0]).toEqual({
      id: '201',
      evento: 'Anulación de boleta',
      estadoAnterior: EstadoBoleta.EMITIDA,
      estadoNuevo: EstadoBoleta.ANULADA,
      estado: EstadoBoleta.ANULADA,
      usuarioActorId: '3',
      motivo: 'Dirección de destino incorrecta',
      fecha: fechaAnulacion.toISOString(),
      fechaHora: fechaAnulacion.toISOString(),
    });
  });

  it('degrada elegantemente el código de orden si Producción no está disponible', async () => {
    const boletaMock = {
      id: '2',
      numero: 'BOL-2026-00002',
      estado: EstadoBoleta.EMITIDA,
      solicitudSalidaId: '2',
      creadoEn: new Date('2026-10-18T15:00:00Z'),
      solicitudSalida: { id: '2', ordenId: '9', destinoDocumental: 'Almacén Norte' },
      items: [{ id: '103', referencia: 'L-8', cantidad: '20.0000' }],
      historial: [],
    };

    qbMock.getMany.mockResolvedValue([boletaMock]);
    produccionMock.consultarOrdenPorId.mockRejectedValue(new Error('Network error'));

    const resultado = await service.consultar({ ordenId: '9' }, 'Bearer token');

    expect(resultado).toHaveLength(1);
    expect(resultado[0].ordenId).toBe('9');
    expect(resultado[0].orden).toBe('9');
  });
});
