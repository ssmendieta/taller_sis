import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { BoletaEnvio } from './entities/boleta-envio.entity';
import { BoletaEnvioItem } from './entities/boleta-envio-item.entity';

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
