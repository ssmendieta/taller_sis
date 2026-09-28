import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateAvancesProduccionDto } from './dto/create-avances_produccion.dto';

function unidades(valor: string | number): bigint {
  const texto = String(valor);
  if (!/^\d+(?:\.\d{1,4})?$/.test(texto)) throw new BadRequestException('La cantidad debe tener hasta 4 decimales');
  const [entero, decimales = ''] = texto.split('.');
  return BigInt(entero) * 10000n + BigInt(decimales.padEnd(4, '0'));
}

@Injectable()
export class AvancesProduccionService {
  constructor(private readonly db: DataSource) {}

  async create(dto: CreateAvancesProduccionDto & { usuario_responsable_id: number }) {
    if (!Number.isSafeInteger(dto.orden_id) || dto.orden_id < 1 ||
        !Number.isSafeInteger(dto.usuario_responsable_id) || dto.usuario_responsable_id < 1) {
      throw new BadRequestException('Los IDs deben ser enteros positivos');
    }
    const cantidad = unidades(dto.cantidad_producida);
    if (cantidad <= 0n) throw new BadRequestException('La cantidad producida debe ser mayor que cero');

    const runner = this.db.createQueryRunner();
    await runner.connect();
    try {
      await runner.startTransaction();
      const [orden] = await runner.query(`
        SELECT id::text AS id, estado, cantidad_solicitada::text AS cantidad_solicitada
        FROM ordenes_produccion WHERE id = $1 FOR UPDATE
      `, [dto.orden_id]);
      if (!orden) throw new NotFoundException('Orden de producción no encontrada');
      if (orden.estado !== 'EN_PRODUCCION') {
        throw new BadRequestException('Solo se registran avances en órdenes EN_PRODUCCION');
      }

      const [suma] = await runner.query(`
        SELECT COALESCE(SUM(cantidad_producida), 0)::text AS acumulado
        FROM avances_produccion WHERE orden_id = $1
      `, [dto.orden_id]);
      if (unidades(suma.acumulado) + cantidad > unidades(orden.cantidad_solicitada)) {
        throw new BadRequestException('El avance supera la cantidad solicitada');
      }

      const [guardado] = await runner.query(`
        INSERT INTO avances_produccion (orden_id, cantidad_producida, usuario_responsable_id)
        VALUES ($1, $2, $3)
        RETURNING id::text AS id, orden_id::text AS orden_id,
                  cantidad_producida::text AS cantidad_producida, fecha_hora,
                  usuario_responsable_id::text AS usuario_responsable_id
      `, [dto.orden_id, dto.cantidad_producida, dto.usuario_responsable_id]);
      await runner.commitTransaction();
      return guardado;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  findAll() {
    return this.db.query(`
      SELECT id::text AS id, orden_id::text AS orden_id,
             cantidad_producida::text AS cantidad_producida, fecha_hora,
             usuario_responsable_id::text AS usuario_responsable_id
      FROM avances_produccion ORDER BY fecha_hora DESC, id DESC
    `);
  }

  async findOne(id: number) {
    const [avance] = await this.db.query(`
      SELECT id::text AS id, orden_id::text AS orden_id,
             cantidad_producida::text AS cantidad_producida, fecha_hora,
             usuario_responsable_id::text AS usuario_responsable_id
      FROM avances_produccion WHERE id = $1
    `, [id]);
    if (!avance) throw new NotFoundException('Avance no encontrado');
    return avance;
  }
}
