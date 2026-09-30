import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateRoleDto {
  @IsOptional()
  @IsString({ message: 'nombre debe ser texto' })
  @MaxLength(80, { message: 'nombre no puede superar 80 caracteres' })
  nombre?: string;

  @IsOptional()
  @IsString({ message: 'descripcion debe ser texto' })
  @MaxLength(255, { message: 'descripcion no puede superar 255 caracteres' })
  descripcion?: string;

  @IsOptional()
  @IsBoolean({ message: 'activo debe ser booleano' })
  activo?: boolean;
}
