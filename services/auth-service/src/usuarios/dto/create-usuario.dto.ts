import { IsEmail, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateUsuarioDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre completo es obligatorio' })
  @MaxLength(150)
  nombre_completo!: string;

  @IsEmail({}, { message: 'Debe ser un correo válido' })
  @IsNotEmpty({ message: 'El correo es obligatorio' })
  @MaxLength(255)
  correo!: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password!: string;

  @IsInt({ message: 'El ID del rol debe ser un entero' })
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  @IsNotEmpty({ message: 'El ID del rol es obligatorio' })
  rol_id!: number;
}
