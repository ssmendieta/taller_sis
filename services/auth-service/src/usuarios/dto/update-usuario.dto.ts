import { IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUsuarioDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre completo es obligatorio' })
  nombre_completo?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Debe ser un correo válido' })
  @IsNotEmpty({ message: 'El correo es obligatorio' })
  correo?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password?: string;

  @IsOptional()
  @IsNumber()
  @IsNotEmpty({ message: 'El ID del rol es obligatorio' })
  rol_id?: number;
}
