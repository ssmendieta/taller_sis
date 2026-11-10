import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('grupos_salida')
export class GrupoSalida {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ type: 'varchar', length: 250 })
  destino!: string;

  @Column({ name: 'fecha_requerida', type: 'date' })
  fechaRequerida!: string;

  @Column({ name: 'tipo_carga', type: 'varchar', length: 80 })
  tipoCarga!: string;

  @Column({ name: 'unidad_carga', type: 'varchar', length: 50 })
  unidadCarga!: string;

  @Column({ name: 'creado_por_usuario_id', type: 'bigint' })
  creadoPorUsuarioId!: string;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @Column({ name: 'deshecho_por_usuario_id', type: 'bigint', nullable: true })
  deshechoPorUsuarioId!: string | null;

  @Column({ name: 'deshecho_en', type: 'timestamptz', nullable: true })
  deshechoEn!: Date | null;
}
