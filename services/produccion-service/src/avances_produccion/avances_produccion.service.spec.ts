import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AvancesProduccionService } from './avances_produccion.service';

describe('ABC-197: registro de avances', () => {
  let estado: string;
  let registros: number[];
  let ejecutadas: string[];
  let commit: jest.Mock;
  let rollback: jest.Mock;
  let servicio: AvancesProduccionService;

  beforeEach(() => {
    estado = 'EN_PRODUCCION';
    registros = [];
    ejecutadas = [];
    commit = jest.fn();
    rollback = jest.fn();
    const runner = {
      connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: commit,
      rollbackTransaction: rollback, release: jest.fn(),
      query: jest.fn(async (sql: string, params: Array<number | string>) => {
        ejecutadas.push(sql);
        if (sql.includes('FOR UPDATE')) {
          return estado === 'INEXISTENTE' ? [] : [{ id: '1', estado, cantidad_solicitada: '10.0000' }];
        }
        if (sql.includes('SUM(cantidad_producida)')) {
          return [{ acumulado: registros.reduce((suma, n) => suma + n, 0).toFixed(4) }];
        }
        if (sql.includes('INSERT INTO avances_produccion')) {
          registros.push(Number(params[1]));
          return [{ id: String(registros.length), orden_id: '1', cantidad_producida: String(params[1]) }];
        }
        return [];
      }),
    };
    servicio = new AvancesProduccionService({ createQueryRunner: () => runner } as unknown as DataSource);
  });

  const datos = (cantidad_producida: number) => ({ orden_id: 1, cantidad_producida, usuario_responsable_id: 2 });

  it('registra un avance válido y confirma la transacción', async () => {
    expect((await servicio.create(datos(3))).cantidad_producida).toBe('3');
    expect(registros).toEqual([3]);
    expect(ejecutadas.some((sql) => sql.includes('FOR UPDATE'))).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(rollback).not.toHaveBeenCalled();
  });

  it('acumula varios avances sin pasar de lo solicitado', async () => {
    await servicio.create(datos(4.125));
    await servicio.create(datos(5.875));
    expect(registros).toEqual([4.125, 5.875]);
  });

  it.each([0, -1])('rechaza cantidad %s sin escribir en base de datos', async (cantidad) => {
    await expect(servicio.create(datos(cantidad))).rejects.toBeInstanceOf(BadRequestException);
    expect(registros).toHaveLength(0);
  });

  it('rechaza exceder el acumulado y revierte la transacción', async () => {
    registros.push(9.9999);
    await expect(servicio.create(datos(0.0002))).rejects.toBeInstanceOf(BadRequestException);
    expect(registros).toEqual([9.9999]);
    expect(rollback).toHaveBeenCalledTimes(1);
  });

  it('rechaza avances en una orden que no está en producción', async () => {
    estado = 'PLANIFICADA';
    await expect(servicio.create(datos(1))).rejects.toBeInstanceOf(BadRequestException);
    expect(registros).toHaveLength(0);
  });

  it('rechaza una orden inexistente', async () => {
    estado = 'INEXISTENTE';
    await expect(servicio.create(datos(1))).rejects.toBeInstanceOf(NotFoundException);
    expect(rollback).toHaveBeenCalledTimes(1);
  });
});
