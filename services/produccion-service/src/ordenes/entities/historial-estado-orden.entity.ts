import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';


@Entity('historial_estado_orden')
export class HistorialEstadoOrden {
  @PrimaryGeneratedColumn('identity')
  id: number;

  @Column({
    name: 'orden_id',
  })
  ordenId: number;

  @Column({
    name: 'estado_anterior',
    length: 20,
    nullable: true,
  })
  estadoAnterior: string | null;

  @Column({
    name: 'estado_nuevo',
    length: 20,
  })
  estadoNuevo: string;

  @Column({
    name: 'usuario_responsable_id',
  })
  usuarioResponsableId: number;

  @Column({
    name: 'fecha_hora',
    type: 'timestamptz',
    default: () => 'NOW()',
  })
  fechaHora: Date;

  @Column({
    length: 500,
    nullable: true,
  })
  motivo: string | null;
}
