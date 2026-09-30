import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Límites alineados con la tabla 'materiales' (varchar 80 / 150 / 40).
// Sin estos decoradores el ValidationPipe global (whitelist +
// forbidNonWhitelisted) borraba todos los campos y respondía 400.
export class CreateMaterialDto {

  @IsString({ message: 'codigo debe ser una cadena' })
  @IsNotEmpty({ message: 'codigo no puede estar vacío' })
  @MaxLength(80)
  codigo: string;

  @IsString({ message: 'nombre debe ser una cadena' })
  @IsNotEmpty({ message: 'nombre no puede estar vacío' })
  @MaxLength(150)
  nombre: string;

  @IsString({ message: 'unidadMedida debe ser una cadena' })
  @IsNotEmpty({ message: 'unidadMedida no puede estar vacía' })
  @MaxLength(40)
  unidadMedida: string;

}
