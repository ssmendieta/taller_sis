import { IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateUsuarioDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombre_completo?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Debe ser un correo válido' })
  @MaxLength(255)
  correo?: string;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password?: string;

  @IsOptional()
  @IsInt({ message: 'El ID del rol debe ser un entero' })
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  rol_id?: number;
}
