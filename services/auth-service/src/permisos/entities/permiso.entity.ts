import {Column, Entity, PrimaryGeneratedColumn, ManyToMany} from 'typeorm';
import {Rol} from '../../roles/entities/role.entity';

@Entity('permisos')
export class Permisos {
    @PrimaryGeneratedColumn('identity', {
        type: 'bigint',
        generatedIdentity: 'ALWAYS',
    })
    id!: string;

    @Column('varchar', {length: 80, unique: true})
    codigo!: string;

    @Column('varchar', {length: 80, unique: true})
    nombre!: string;

    @Column('varchar', {length: 255, nullable: true})
    descripcion?: string;

    @Column('boolean', {default: true})
    activo!: boolean;

    @Column('timestamptz', {default: () => 'NOW()'})
    creado_en!: Date;

    @ManyToMany('Rol', (rol: any) => rol.permisos)
    roles!: Rol[];

}