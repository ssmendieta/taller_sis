import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class MaterialRecetaDto {
  @IsInt({ message: 'materialId debe ser un entero' })
  @Min(1, { message: 'materialId debe ser mayor a 0' })
  materialId!: number;

  @IsOptional()
  @IsString({ message: 'materialCodigo debe ser texto' })
  materialCodigo?: string;

  @IsOptional()
  @IsString({ message: 'materialNombre debe ser texto' })
  materialNombre?: string;

  @IsOptional()
  @IsString({ message: 'unidadMedida debe ser texto' })
  unidadMedida?: string;

  @IsNumber({}, { message: 'cantidadRequerida debe ser numérica' })
  @IsPositive({ message: 'cantidadRequerida debe ser mayor a 0' })
  cantidadRequerida!: number;
}

export class CalcularMaterialesDto {
  @IsNumber({}, { message: 'cantidadSolicitada debe ser numérica' })
  @IsPositive({ message: 'cantidadSolicitada debe ser mayor a 0' })
  cantidadSolicitada!: number;

  @IsArray({ message: 'materialesReceta debe ser una lista' })
  @ArrayMinSize(1, { message: 'materialesReceta no puede estar vacía' })
  @ValidateNested({ each: true })
  @Type(() => MaterialRecetaDto)
  materialesReceta!: MaterialRecetaDto[];
}
