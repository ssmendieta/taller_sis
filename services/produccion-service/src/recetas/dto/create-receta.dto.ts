import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

export class RecetaMaterialItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
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
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  producto_codigo: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  producto_nombre: string;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecetaMaterialItemDto)
  materiales?: RecetaMaterialItemDto[];
}
