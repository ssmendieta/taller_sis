import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CODIGOS_UNIDADES } from '../../unidades/unidades.catalogo';

export class RecetaMaterialItemDto {
  @Type(() => Number)
  @IsInt({ message: 'material_id debe ser un número entero' })
  @Min(1, { message: 'material_id debe ser mayor a 0' })
  material_id: number;

  // numeric(14,4): positivo, máximo 4 decimales, tope del tipo.
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 4 },
    { message: 'cantidad_requerida debe ser numérica con máximo 4 decimales' },
  )
  @IsPositive({ message: 'cantidad_requerida debe ser mayor que 0' })
  @Max(9999999999.9999)
  cantidad_requerida: number;
}

export class CreateRecetaDto {
  // Compatibilidad: si se recibe producto_codigo se respeta y se valida
  // unicidad; si se omite, el backend lo autogenera (PRD-0001 secuencial).
  @IsOptional()
  @IsString({ message: 'producto_codigo debe ser texto' })
  @IsNotEmpty({ message: 'producto_codigo no puede estar vacío' })
  @MaxLength(80)
  producto_codigo?: string;

  @IsString({ message: 'producto_nombre debe ser texto' })
  @IsNotEmpty({ message: 'producto_nombre es obligatorio' })
  @MaxLength(150)
  producto_nombre: string;

  // Unidad del producto terminado. Opcional por compatibilidad con clientes
  // antiguos: si se omite se usa 'unidad'.
  @IsOptional()
  @IsString({ message: 'unidad_producto debe ser texto' })
  @IsIn(CODIGOS_UNIDADES, {
    message: `unidad_producto debe ser una unidad válida: ${CODIGOS_UNIDADES.join(', ')}`,
  })
  unidad_producto?: string;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;

  @IsOptional()
  @IsArray({ message: 'materiales debe ser una lista' })
  @ArrayMinSize(1, { message: 'materiales debe tener al menos un ingrediente' })
  @ValidateNested({ each: true })
  @Type(() => RecetaMaterialItemDto)
  materiales?: RecetaMaterialItemDto[];
}
