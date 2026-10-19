import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { BoletaEnvio } from './entities/boleta-envio.entity';
import { BoletaEnvioItem } from './entities/boleta-envio-item.entity';
import { BoletaEnvioHistorial } from './entities/boleta-envio-historial.entity';
import { ReglaConcurrenciaDocumental1710000000003 } from '../database/migrations/1710000000003-ReglaConcurrenciaDocumental';
import { HistorialBoletasEnvio1710000000004 } from '../database/migrations/1710000000004-HistorialBoletasEnvio';

describe('ABC-212: modelo de boleta y sus ítems', () => {
  it('registra entidades, restricciones, relación y tipos numéricos', () => {
    const tables = getMetadataArgsStorage().tables;
    expect(tables.some((table) => table.target === BoletaEnvio && table.name === 'boletas_envio')).toBe(true);
    expect(tables.some((table) => table.target === BoletaEnvioItem && table.name === 'boletas_envio_items')).toBe(true);

    const checks = getMetadataArgsStorage().checks
      .filter((check) => check.target === BoletaEnvio || check.target === BoletaEnvioItem)
      .map((check) => check.name);
    expect(checks).toEqual(expect.arrayContaining([
      'ck_boleta_envio_estado',
      'ck_boleta_envio_responsable',
      'ck_boleta_envio_item_referencia',
      'ck_boleta_envio_item_cantidad',
    ]));

    const columns = getMetadataArgsStorage().columns.filter((column) =>
      column.target === BoletaEnvioItem && column.propertyName === 'cantidad');
    expect(columns[0]?.options).toMatchObject({ type: 'numeric', precision: 14, scale: 4 });
  });
});

describe('ABC-224: persistencia de la exclusión por orden y producto', () => {
  it('crea una clave compartida y única para serializar emisores', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new ReglaConcurrenciaDocumental1710000000003().up({ query } as any);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('CREATE TABLE boleta_emision_bloqueos');
    expect(sql).toContain('PRIMARY KEY (orden_id, producto_id)');
  });
});

describe('ABC-245: modelo de historial/auditoría de boletas y su persistencia', () => {
  it('registra la entidad de auditoría con sus restricciones de estado, actor y motivo no vacío', () => {
    const tables = getMetadataArgsStorage().tables;
    expect(tables.some((table) => table.target === BoletaEnvioHistorial && table.name === 'boletas_envio_historial')).toBe(true);

    const checks = getMetadataArgsStorage().checks
      .filter((check) => check.target === BoletaEnvioHistorial)
      .map((check) => check.name);
    expect(checks).toEqual(expect.arrayContaining([
      'ck_boleta_envio_historial_estado_anterior',
      'ck_boleta_envio_historial_estado_nuevo',
      'ck_boleta_envio_historial_actor',
      'ck_boleta_envio_historial_motivo',
    ]));

    const columns = getMetadataArgsStorage().columns.filter((col) => col.target === BoletaEnvioHistorial);
    const columnNames = columns.map((col) => col.propertyName);
    expect(columnNames).toEqual(expect.arrayContaining([
      'boletaId',
      'estadoAnterior',
      'estadoNuevo',
      'usuarioActorId',
      'motivo',
      'fechaHora',
    ]));

    const relations = getMetadataArgsStorage().relations.filter((rel) =>
      rel.target === BoletaEnvio && rel.propertyName === 'historial');
    expect(relations).toHaveLength(1);
    expect(relations[0].relationType).toBe('one-to-many');
  });

  it('la migración crea la tabla boletas_envio_historial con FK RESTRICT e índices apropiados', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new HistorialBoletasEnvio1710000000004();

    await migration.up({ query } as any);

    const upSql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(upSql).toContain('CREATE TABLE boletas_envio_historial');
    expect(upSql).toContain('FOREIGN KEY (boleta_id)');
    expect(upSql).toContain('REFERENCES boletas_envio(id) ON DELETE RESTRICT');
    expect(upSql).toContain('CHECK (LENGTH(BTRIM(motivo)) > 0)');
    expect(upSql).toContain('CREATE INDEX ix_boletas_envio_historial_boleta');
    expect(upSql).toContain('CREATE INDEX ix_boletas_envio_historial_fecha');

    query.mockClear();
    await migration.down({ query } as any);

    const downSql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(downSql).toContain('DROP TABLE boletas_envio_historial;');
  });
});
