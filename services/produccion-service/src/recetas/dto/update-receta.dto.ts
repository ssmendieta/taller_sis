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

// PATCH /recetas/:id: solo producto_nombre, unidad_producto y/o lista de
// materiales. producto_codigo NO es actualizable (es la clave de la regla
// de unicidad parcial ux_receta_producto_activa). Si se envía `materiales`,
// reemplaza por completo las filas de receta_material de esa receta.
export class UpdateRecetaDto {
  @IsOptional()
  @IsString({ message: 'producto_nombre debe ser texto' })
  @IsNotEmpty({ message: 'producto_nombre no puede estar vacío' })
  @MaxLength(150)
  producto_nombre?: string;

  @IsOptional()
  @IsString({ message: 'unidad_producto debe ser texto' })
  @IsIn(CODIGOS_UNIDADES, {
    message: `unidad_producto debe ser una unidad válida: ${CODIGOS_UNIDADES.join(', ')}`,
  })
  unidad_producto?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'materiales debe tener al menos un ingrediente' })
  @ValidateNested({ each: true })
  @Type(() => RecetaMaterialItemDto)
  materiales?: RecetaMaterialItemDto[];
}
