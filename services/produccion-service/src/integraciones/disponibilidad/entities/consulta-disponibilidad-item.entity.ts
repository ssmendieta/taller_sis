import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { EstadoDisponibilidadMaterial } from '../../contratos/inventario-almacen-v1';

@Entity('consulta_disponibilidad_items')
@Index('uq_consulta_disponibilidad_item_material', ['consultaDisponibilidadId', 'materialId'], { unique: true })
export class ConsultaDisponibilidadItem {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id: string;

  @Column({ name: 'consulta_disponibilidad_id', type: 'bigint' })
  consultaDisponibilidadId: string;

  @Column({ name: 'material_id', type: 'bigint' })
  materialId: string;

  @Column({ name: 'material_codigo', type: 'varchar', length: 80 })
  materialCodigo: string;

  @Column({ name: 'material_nombre', type: 'varchar', length: 160 })
  materialNombre: string;

  @Column({ name: 'cantidad_requerida', type: 'numeric', precision: 14, scale: 4 })
  cantidadRequerida: string;

  @Column({ name: 'cantidad_disponible', type: 'numeric', precision: 14, scale: 4, nullable: true })
  cantidadDisponible: string | null;

  @Column({ type: 'varchar', length: 30 })
  unidad: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  estado: EstadoDisponibilidadMaterial | null;
}
