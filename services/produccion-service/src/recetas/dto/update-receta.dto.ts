import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { RecetaMaterialItemDto } from './create-receta.dto';

// PATCH /recetas/:id: solo producto_nombre y/o lista de materiales.
// producto_codigo NO es actualizable (es la clave de la regla de unicidad
// parcial ux_receta_producto_activa). Si se envía `materiales`, reemplaza
// por completo las filas de receta_material de esa receta.
export class UpdateRecetaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  producto_nombre?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecetaMaterialItemDto)
  materiales?: RecetaMaterialItemDto[];
}
