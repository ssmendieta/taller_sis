import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrdenProduccion } from './entities/orden-produccion.entity';
import { CreateOrdenDto } from './dto/create-orden.dto';

@Injectable()
export class OrdenesService {
  constructor(
    @InjectRepository(OrdenProduccion)
    private readonly ordenRepository: Repository<OrdenProduccion>,
  ) {}

  async create(createOrdenDto: CreateOrdenDto): Promise<OrdenProduccion> {
    const codigo = `ORD-${Math.floor(Date.now() / 1000)}`;

    const nuevaOrden = this.ordenRepository.create({
      ...createOrdenDto,
      codigo, 
      estado: 'PENDIENTE', 
    });

    return await this.ordenRepository.save(nuevaOrden);
  }

  async obtenerMateriales(id: number) {
    const resultado = await this.ordenRepository.query(`
      SELECT
        o.id AS orden_id,
        o.codigo AS orden_codigo,
        m.codigo,
        m.nombre,
        m.unidad_medida,
        rm.cantidad_requerida
      FROM ordenes_produccion o
      INNER JOIN receta_material rm ON rm.receta_id = o.receta_id
      INNER JOIN materiales m ON m.id = rm.material_id
      WHERE o.id = $1
    `, [id]);

    return resultado;
  }

  async buscar(estado?: string, producto?: string, fecha?: string) {
    const query = this.ordenRepository
      .createQueryBuilder('orden')
      .where('1=1');

    if (estado) {
      query.andWhere('orden.estado = :estado', { estado });
    }

    if (producto) {
      query.andWhere('orden.codigo ILIKE :producto', { producto: `%${producto}%` });
    }

    if (fecha) {
      query.andWhere('orden.fecha_programada = :fecha', { fecha });
    }

    return query.getMany();
  }
} 