import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { BoletaEnvio } from './entities/boleta-envio.entity';
import { BoletaEnvioItem } from './entities/boleta-envio-item.entity';
import { ReglaConcurrenciaDocumental1710000000003 } from '../database/migrations/1710000000003-ReglaConcurrenciaDocumental';

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
