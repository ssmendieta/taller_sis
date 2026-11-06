import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ObservacionesOrden1710000000023 } from '../database/migrations/1710000000023-ObservacionesOrden';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { ObservacionOrden } from './entities/observacion-orden.entity';

describe('ABC-321: metadatos de ObservacionOrden', () => {
  it('registra relación con la orden, tipo, autor y fecha automática', async () => {
    const source = new DataSource({ type: 'postgres', entities: [ObservacionOrden, OrdenProduccion] });
    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
    const metadata = source.getMetadata(ObservacionOrden);

    expect(metadata.tableName).toBe('observaciones_orden');
    expect(metadata.findRelationWithPropertyPath('orden')).toMatchObject({ onDelete: 'RESTRICT' });
    expect(metadata.findColumnWithPropertyName('tipo')?.isNullable).toBe(false);
    expect(metadata.findColumnWithPropertyName('descripcion')).toMatchObject({ length: '1000', isNullable: false });
    expect(metadata.findColumnWithPropertyName('autorUsuarioId')?.isNullable).toBe(false);
    expect(metadata.findColumnWithPropertyName('fechaHora')).toMatchObject({ type: 'timestamptz', isCreateDate: true });
    expect(metadata.checks.map((check) => check.name)).toEqual(expect.arrayContaining([
      'ck_observacion_orden_tipo', 'ck_observacion_orden_descripcion', 'ck_observacion_orden_autor',
    ]));
  });
});

describe('ABC-321: migración de observaciones', () => {
  it('crea una tabla propia con FK a la orden, sin reutilizar mermas ni calidad', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new ObservacionesOrden1710000000023().up({ query } as any);
    const sql = query.mock.calls.map(([s]) => s).join('\n');

    expect(sql).toContain('CREATE TABLE observaciones_orden');
    expect(sql).toContain('REFERENCES ordenes_produccion(id) ON DELETE RESTRICT');
    expect(sql).toContain("CHECK (tipo IN ('OBSERVACION','INCIDENCIA'))");
    expect(sql).not.toMatch(/resultados_conformes|perdidas/);
  });

  it('la reversión elimina la tabla', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new ObservacionesOrden1710000000023().down({ query } as any);
    expect(query).toHaveBeenCalledWith('DROP TABLE observaciones_orden;');
  });
});
