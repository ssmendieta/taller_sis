import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Demanda } from './demanda.entity';

@Entity('demandas_items')
@Unique('uq_demanda_item_producto', ['demandaId', 'productoCodigo'])
@Check('ck_demanda_item_cantidad', "cantidad > 0 AND cantidad <> 'NaN'::numeric")
@Check('ck_demanda_item_producto', 'LENGTH(BTRIM(producto_codigo)) > 0')
@Check('ck_demanda_item_unidad', 'LENGTH(BTRIM(unidad)) > 0')
export class DemandaItem {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id: string;

  @Column({ name: 'demanda_id', type: 'bigint' })
  demandaId: string;

  @ManyToOne(() => Demanda, (demanda) => demanda.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'demanda_id', foreignKeyConstraintName: 'fk_demanda_item_demanda' })
  demanda: Demanda;

  // Código del producto según el sistema de origen; Producción no tiene FK a Ventas.
  @Column({ name: 'producto_codigo', type: 'varchar', length: 80 })
  productoCodigo: string;

  @Column({ type: 'numeric', precision: 14, scale: 4 })
  cantidad: string;

  @Column({ type: 'varchar', length: 20 })
  unidad: string;
}
