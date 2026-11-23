import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { HoraRealEntregaParada1710000000016 } from '../database/migrations/1710000000016-HoraRealEntregaParada';
import { RutaParada } from './entities/ruta-parada.entity';

describe('ABC-453: hora real de entrega de la parada', () => {
  it('la entidad declara entregada_en opcional y su restricción', () => {
    const { columns, checks } = getMetadataArgsStorage();
    const columna = columns.find((c) => c.target === RutaParada && c.propertyName === 'entregadaEn');
    expect(columna?.options).toMatchObject({ name: 'entregada_en', type: 'timestamptz', nullable: true });
    expect(checks.filter((c) => c.target === RutaParada).map((c) => c.name)).toContain('ck_ruta_parada_entregada_en');
  });

  it('sube: agrega la columna, completa las paradas ya entregadas y no toca las demás', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new HoraRealEntregaParada1710000000016().up({ query } as any);
    const sql = query.mock.calls.map(([s]) => s.replace(/\s+/g, ' ').trim());
    expect(sql).toEqual([
      'ALTER TABLE rutas_paradas ADD COLUMN entregada_en TIMESTAMPTZ NULL;',
      "UPDATE rutas_paradas SET entregada_en = entrega_actualizada_en WHERE estado_entrega = 'ENTREGADA';",
      "ALTER TABLE rutas_paradas ADD CONSTRAINT ck_ruta_parada_entregada_en CHECK (entregada_en IS NULL OR estado_entrega = 'ENTREGADA');",
    ]);
  });

  it('baja: quita la restricción y la columna', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new HoraRealEntregaParada1710000000016().down({ query } as any);
    expect(query.mock.calls.map(([s]) => s)).toEqual([
      'ALTER TABLE rutas_paradas DROP CONSTRAINT ck_ruta_parada_entregada_en;',
      'ALTER TABLE rutas_paradas DROP COLUMN entregada_en;',
    ]);
  });
});
