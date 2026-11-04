import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { RecetaMaterialItemDto } from './create-receta.dto';
import { CODIGOS_UNIDADES } from '../../unidades/unidades.catalogo';

// ABC-137: cuerpo de POST /recetas/:id/versiones.
// Reutiliza RecetaMaterialItemDto para que las reglas de material_id y
// cantidad_requerida sean idénticas a las de POST /recetas.
export class CrearVersionRecetaDto {
  @IsString({ message: 'producto_nombre debe ser una cadena' })
  @IsNotEmpty({ message: 'producto_nombre no puede estar vacío' })
  @MaxLength(150)
  producto_nombre: string;

  @IsOptional()
  @IsString({ message: 'unidad_producto debe ser texto' })
  @IsIn(CODIGOS_UNIDADES, {
    message: `unidad_producto debe ser una unidad válida: ${CODIGOS_UNIDADES.join(', ')}`,
  })
  unidad_producto?: string;

  @IsArray({ message: 'materiales debe ser un arreglo' })
  @ArrayMinSize(1, { message: 'materiales debe tener al menos un elemento' })
  @ValidateNested({ each: true })
  @Type(() => RecetaMaterialItemDto)
  materiales: RecetaMaterialItemDto[];
}
