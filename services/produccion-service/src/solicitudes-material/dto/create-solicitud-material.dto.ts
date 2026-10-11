import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, Max, Min, ValidateNested } from 'class-validator';
import { CODIGOS_UNIDADES } from '../../unidades/unidades.catalogo';

export class CreateSolicitudMaterialItemDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  materialId: number;

  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(9999999999.9999)
  cantidad: number;

  @IsIn(CODIGOS_UNIDADES)
  unidad: string;
}

export class CreateSolicitudMaterialDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  ordenId: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSolicitudMaterialItemDto)
  items: CreateSolicitudMaterialItemDto[];
}
