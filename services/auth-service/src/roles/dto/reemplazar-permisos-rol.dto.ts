import { IsArray, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReemplazarPermisosRolDto {
  @IsArray({ message: 'permisoIds debe ser una lista' })
  @Type(() => Number)
  @IsInt({ each: true, message: 'cada permiso debe ser un entero' })
  @Min(1, { each: true, message: 'cada permiso debe ser mayor a 0' })
  permisoIds!: number[];
}
