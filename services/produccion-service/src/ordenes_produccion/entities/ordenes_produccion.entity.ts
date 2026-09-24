import {Entity, PrimaryGeneratedColumn, Column} from 'typeorm';

@Entity('ordenes_produccion')
export class OrdenProduccion {
    @PrimaryGeneratedColumn('identity', {
        type: 'bigint',
        generatedIdentity: 'ALWAYS',
    })
    id!: string;

    @Column({type: 'varchar', length: 40, unique: true})
    codigo!: string;

    @Column({type: 'bigint'})
    receta_id!: string;

    @Column({type: 'numeric', precision: 14, scale: 4})
    cantidad_solicitada!: number;

    @Column({type: 'date'})
    fecha_programada!: string;

    @Column({type: 'varchar', length: 20, default: 'PENDIENTE'})
    estado!: string;

    @Column({type: 'bigint'})
    responsable_usuario_id!: string;

    @Column({type: 'timestamptz', nullable: true})
    iniciada_en?: Date;

    @Column({type: 'timestamptz', nullable: true})
    finalizada_en?: Date;

    @Column({type: 'timestamptz', nullable: true})
    cancelada_en?: Date;

    @Column({type: 'timestamptz', default: () => 'NOW()'})
    creado_en!: Date;

    @Column({type: 'timestamptz', default: () => 'NOW()'})
    actualizado_en!: Date;
}