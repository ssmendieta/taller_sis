import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { Ruta } from './entities/ruta.entity';
import { RutaParada } from './entities/ruta-parada.entity';
import { RutaParadaBoleta } from './entities/ruta-parada-boleta.entity';
import { CrearRutas1710000000005 } from '../database/migrations/1710000000005-CrearRutas';

describe('ABC-369: modelo de ruta, paradas y documentos', () => {
  it('registra las tres tablas de Logística', () => {
    const tables = getMetadataArgsStorage().tables;
    expect(tables.some((t) => t.target === Ruta && t.name === 'rutas')).toBe(true);
    expect(tables.some((t) => t.target === RutaParada && t.name === 'rutas_paradas')).toBe(true);
    expect(tables.some((t) => t.target === RutaParadaBoleta && t.name === 'rutas_paradas_boletas')).toBe(true);
  });

  it('conserva grupo, fecha, vehículo, chofer y estado de la ruta', () => {
    const columnas = getMetadataArgsStorage().columns
      .filter((c) => c.target === Ruta)
      .map((c) => c.propertyName);
    expect(columnas).toEqual(expect.arrayContaining([
      'grupoId', 'fechaProgramada', 'vehiculoExternoId', 'choferExternoId', 'estado', 'responsableUsuarioId',
    ]));
  });

  it('declara restricciones de estado, recursos y secuencia', () => {
    const checks = getMetadataArgsStorage().checks
      .filter((c) => [Ruta, RutaParada].includes(c.target as any))
      .map((c) => c.name);
    expect(checks).toEqual(expect.arrayContaining([
      'ck_ruta_estado', 'ck_ruta_vehiculo', 'ck_ruta_chofer', 'ck_ruta_parada_secuencia', 'ck_ruta_parada_destino',
    ]));
  });

  it('la migración no crea claves foráneas hacia el ERP ni hacia grupos', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new CrearRutas1710000000005().up({ query } as any);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');

    expect(sql).toContain('CREATE TABLE rutas (');
    expect(sql).toContain('CREATE TABLE rutas_paradas (');
    expect(sql).toContain('CREATE TABLE rutas_paradas_boletas (');
    expect(sql).toContain('REFERENCES boletas_envio(id) ON DELETE RESTRICT');
    expect(sql).toContain('UNIQUE (ruta_id, secuencia)');
    expect(sql).not.toMatch(/vehiculo_externo_id[^\n]*REFERENCES/);
    expect(sql).not.toMatch(/chofer_externo_id[^\n]*REFERENCES/);
    expect(sql).not.toMatch(/grupo_id[^\n]*REFERENCES/);
  });

  it('la reversión elimina las tablas en orden inverso', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new CrearRutas1710000000005().down({ query } as any);
    expect(query.mock.calls.map(([s]) => s)).toEqual([
      'DROP TABLE rutas_paradas_boletas;',
      'DROP TABLE rutas_paradas;',
      'DROP TABLE rutas;',
    ]);
  });
});
