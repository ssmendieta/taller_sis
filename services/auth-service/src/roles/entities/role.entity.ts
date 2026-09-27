import {Column, Entity, PrimaryGeneratedColumn, JoinTable, ManyToMany} from 'typeorm';
import {Permisos} from '../../permisos/entities/permiso.entity';

@Entity('roles')
export class Rol {
    @PrimaryGeneratedColumn('identity', {
        type: 'bigint',
        generatedIdentity: 'ALWAYS',
    })
    id!: string;

    @Column('varchar', {length: 80, unique: true})
    nombre!: string;

    @Column('varchar', {length: 255, nullable: true})
    descripcion?: string;

    @Column('boolean', {default: true})
    activo!: boolean;

    @Column('timestamptz', {default: () => 'NOW()'})
    creado_en!: Date;

    @Column('timestamptz', {default: () => 'NOW()'})
    actualizado_en!: Date;

    @ManyToMany(() => Permisos, (permiso) => permiso.roles)
    @JoinTable({
        name: 'roles_permisos', 
        joinColumn: {
            name: 'rol_id',
            referencedColumnName: 'id',
            foreignKeyConstraintName: 'fk_roles_permisos_rol',
        },
        inverseJoinColumn: {
            name: 'permiso_id',
            referencedColumnName: 'id',
            foreignKeyConstraintName: 'fk_rol_permiso_permiso',
        },
        synchronize: false,
    })
    permisos!: Permisos[];

}