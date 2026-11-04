import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Demandas1710000000024 } from '../database/migrations/1710000000024-Demandas';
import { EstadoConfirmadaDemanda1710000000026 } from '../database/migrations/1710000000026-EstadoConfirmadaDemanda';
import { DemandaItem } from './entities/demanda-item.entity';
import { Demanda, ESTADO_DEMANDA_CONFIRMADA, ESTADO_DEMANDA_RECIBIDA } from './entities/demanda.entity';
import { DemandaNoEncontradaError, ProcesadorDemandaService } from './procesador-demanda.service';

describe('ABC-355: metadatos de Demanda y sus ítems', () => {
  it('registra origen, id externo, fecha, estado RECIBIDA e ítems con cantidad decimal', async () => {
    const source = new DataSource({ type: 'postgres', entities: [Demanda, DemandaItem] });
    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
    const demanda = source.getMetadata(Demanda);
    const item = source.getMetadata(DemandaItem);

    expect(demanda.tableName).toBe('demandas');
    expect(demanda.findColumnWithPropertyName('fechaRequerida')?.type).toBe('date');
    expect(demanda.findColumnWithPropertyName('estado')?.default).toBe('RECIBIDA');
    expect(demanda.uniques.map((u) => u.name)).toContain('uq_demanda_origen_externa');
    expect(item.findColumnWithPropertyName('cantidad')).toMatchObject({ precision: 14, scale: 4 });
    expect(item.findRelationWithPropertyPath('demanda')).toMatchObject({ onDelete: 'CASCADE' });
  });
});

describe('ABC-355: migración de demandas', () => {
  it('crea demanda e ítems con unicidad por origen e id externo', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new Demandas1710000000024().up({ query } as any);
    const sql = query.mock.calls.map(([s]) => s).join('\n');

    expect(sql).toContain('CREATE TABLE demandas (');
    expect(sql).toContain('CREATE TABLE demandas_items (');
    expect(sql).toContain('UNIQUE (origen, demanda_externa_id)');
    expect(sql).toContain("estado VARCHAR(20) NOT NULL DEFAULT 'RECIBIDA'");
    expect(sql).toContain('REFERENCES demandas(id) ON DELETE CASCADE');
  });

  it('la reversión elimina ítems y demandas', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new Demandas1710000000024().down({ query } as any);
    expect(query.mock.calls.map(([s]) => s)).toEqual(['DROP TABLE demandas_items;', 'DROP TABLE demandas;']);
  });
});

describe('ABC-364: metadatos de estado CONFIRMADA y campos de confirmación', () => {
  it('soporta estado CONFIRMADA, columnas de fecha y correlación nullable', async () => {
    const source = new DataSource({ type: 'postgres', entities: [Demanda, DemandaItem] });
    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
    const demanda = source.getMetadata(Demanda);

    expect(demanda.findColumnWithPropertyName('confirmadaEn')?.type).toBe('timestamptz');
    expect(demanda.findColumnWithPropertyName('confirmadaEn')?.isNullable).toBe(true);
    expect(demanda.findColumnWithPropertyName('confirmacionEventId')?.type).toBe('uuid');
    expect(demanda.findColumnWithPropertyName('confirmacionEventId')?.isNullable).toBe(true);
    expect(demanda.findColumnWithPropertyName('confirmacionCorrelationId')?.type).toBe('uuid');
    expect(demanda.findColumnWithPropertyName('confirmacionCorrelationId')?.isNullable).toBe(true);

    const checkEstado = demanda.checks.find((c) => c.name === 'ck_demanda_estado');
    expect(checkEstado?.expression).toContain("'RECIBIDA', 'CONFIRMADA'");
  });
});

describe('ABC-364: migración EstadoConfirmadaDemanda1710000000026', () => {
  it('actualiza constraint de estado, agrega columnas de confirmación e índice', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new EstadoConfirmadaDemanda1710000000026().up({ query } as any);
    const sql = query.mock.calls.map(([s]) => s).join('\n');

    expect(sql).toContain('ALTER TABLE demandas DROP CONSTRAINT ck_demanda_estado;');
    expect(sql).toContain("ALTER TABLE demandas ADD CONSTRAINT ck_demanda_estado CHECK (estado IN ('RECIBIDA', 'CONFIRMADA'));");
    expect(sql).toContain('ALTER TABLE demandas ADD COLUMN confirmada_en TIMESTAMPTZ;');
    expect(sql).toContain('ALTER TABLE demandas ADD COLUMN confirmacion_event_id UUID;');
    expect(sql).toContain('ALTER TABLE demandas ADD COLUMN confirmacion_correlation_id UUID;');
    expect(sql).toContain("CREATE INDEX ix_demandas_confirmadas ON demandas (estado, fecha_requerida) WHERE estado = 'CONFIRMADA';");
  });

  it('la reversión elimina índice, columnas y restaura constraint original', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new EstadoConfirmadaDemanda1710000000026().down({ query } as any);
    const sql = query.mock.calls.map(([s]) => s).join('\n');

    expect(sql).toContain('DROP INDEX IF EXISTS ix_demandas_confirmadas;');
    expect(sql).toContain('ALTER TABLE demandas DROP COLUMN confirmacion_correlation_id;');
    expect(sql).toContain('ALTER TABLE demandas DROP COLUMN confirmacion_event_id;');
    expect(sql).toContain('ALTER TABLE demandas DROP COLUMN confirmada_en;');
    expect(sql).toContain('ALTER TABLE demandas DROP CONSTRAINT ck_demanda_estado;');
    expect(sql).toContain("ALTER TABLE demandas ADD CONSTRAINT ck_demanda_estado CHECK (estado IN ('RECIBIDA'));");
  });
});

describe('ABC-364: transición de demanda de RECIBIDA a CONFIRMADA', () => {
  it('la misma demanda pasa a CONFIRMADA conservando items e id externo', async () => {
    const fechaConf = new Date('2026-11-04T12:00:00.000Z');
    const demandaMock: Partial<Demanda> = {
      id: '42',
      origen: 'VENTAS',
      demandaExternaId: 'PED-2026-0099',
      fechaRequerida: '2026-11-20',
      estado: ESTADO_DEMANDA_RECIBIDA,
      eventId: 'evt-origen-1',
      correlationId: 'corr-origen-1',
      contenidoHash: 'hash123',
      items: [
        { id: '1', demandaId: '42', productoCodigo: 'GAL-001', cantidad: '10.0000', unidad: 'kg' } as DemandaItem,
        { id: '2', demandaId: '42', productoCodigo: 'PAN-001', cantidad: '50.0000', unidad: 'unidad' } as DemandaItem,
      ],
      recibidaEn: new Date('2026-11-03T10:00:00.000Z'),
      confirmadaEn: null,
      confirmacionEventId: null,
      confirmacionCorrelationId: null,
    };

    const findOne = jest.fn().mockResolvedValue(demandaMock);
    const save = jest.fn().mockImplementation((_entity, entidad) => Promise.resolve(entidad));
    const emMock = { findOne, save } as any;

    const procesador = new ProcesadorDemandaService({} as any);
    const resultado = await procesador.confirmarDemanda(
      'VENTAS',
      'PED-2026-0099',
      {
        confirmadaEn: fechaConf,
        confirmacionEventId: 'evt-conf-999',
        confirmacionCorrelationId: 'corr-conf-999',
      },
      emMock,
    );

    // Mismo id, origen e id externo conservados
    expect(resultado.id).toBe('42');
    expect(resultado.origen).toBe('VENTAS');
    expect(resultado.demandaExternaId).toBe('PED-2026-0099');
    // Estado transicionado y fecha persistida
    expect(resultado.estado).toBe(ESTADO_DEMANDA_CONFIRMADA);
    expect(resultado.confirmadaEn).toEqual(fechaConf);
    expect(resultado.confirmacionEventId).toBe('evt-conf-999');
    expect(resultado.confirmacionCorrelationId).toBe('corr-conf-999');
    // Items conservados sin duplicarse
    expect(resultado.items).toHaveLength(2);
    expect(resultado.items[0].productoCodigo).toBe('GAL-001');
    expect(resultado.items[1].productoCodigo).toBe('PAN-001');
    expect(save).toHaveBeenCalledWith(Demanda, expect.objectContaining({
      id: '42',
      estado: ESTADO_DEMANDA_CONFIRMADA,
      confirmadaEn: fechaConf,
    }));
  });

  it('idempotencia: una confirmación repetida conserva el estado CONFIRMADA sin reescribir', async () => {
    const fechaOriginal = new Date('2026-11-04T10:00:00.000Z');
    const demandaYaConfirmada: Partial<Demanda> = {
      id: '42',
      origen: 'VENTAS',
      demandaExternaId: 'PED-2026-0099',
      estado: ESTADO_DEMANDA_CONFIRMADA,
      confirmadaEn: fechaOriginal,
      confirmacionEventId: 'evt-conf-original',
      confirmacionCorrelationId: 'corr-conf-original',
      items: [{ id: '1', demandaId: '42', productoCodigo: 'GAL-001', cantidad: '10.0000', unidad: 'kg' } as DemandaItem],
    };

    const findOne = jest.fn().mockResolvedValue(demandaYaConfirmada);
    const save = jest.fn();
    const emMock = { findOne, save } as any;

    const procesador = new ProcesadorDemandaService({} as any);
    const resultado = await procesador.confirmarDemanda(
      'VENTAS',
      'PED-2026-0099',
      {
        confirmadaEn: new Date('2026-11-04T15:00:00.000Z'),
        confirmacionEventId: 'evt-conf-repetida',
      },
      emMock,
    );

    expect(resultado.estado).toBe(ESTADO_DEMANDA_CONFIRMADA);
    expect(resultado.confirmadaEn).toEqual(fechaOriginal);
    expect(resultado.confirmacionEventId).toBe('evt-conf-original');
    expect(save).not.toHaveBeenCalled();
  });

  it('lanza DemandaNoEncontradaError si la demanda no existe', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const emMock = { findOne } as any;

    const procesador = new ProcesadorDemandaService({} as any);
    await expect(procesador.confirmarDemanda('VENTAS', 'PED-INEXISTENTE', {}, emMock))
      .rejects
      .toThrow(DemandaNoEncontradaError);
  });
});
