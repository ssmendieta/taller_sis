import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CODIGOS_UNIDADES } from '../../unidades/unidades.catalogo';

// Límites alineados con la tabla 'materiales' (varchar 80 / 150).
// unidadMedida se valida contra el catálogo único (no texto libre).
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
  @IsIn(CODIGOS_UNIDADES, {
    message: `unidadMedida debe ser una unidad válida: ${CODIGOS_UNIDADES.join(', ')}`,
  })
  @MaxLength(40)
  unidadMedida: string;

}
