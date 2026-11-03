import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Demandas1710000000024 } from '../database/migrations/1710000000024-Demandas';
import { DemandaItem } from './entities/demanda-item.entity';
import { Demanda } from './entities/demanda.entity';

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
