import { IsIn, IsInt, IsNumber, Max, Min } from 'class-validator';
import { CODIGOS_UNIDADES } from '../../unidades/unidades.catalogo';

export class CreateConsumoMaterialDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  ordenId: number;

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
