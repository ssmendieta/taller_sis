import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { CODIGOS_UNIDADES } from '../../unidades/unidades.catalogo';

// Autor y fecha no se reciben: los fijan la sesión y el servidor.
export class CrearPerdidaMateriaPrimaDto {
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

  @IsString()
  @Matches(/\S/, { message: 'El motivo de la pérdida es obligatorio' })
  @MaxLength(500)
  motivo: string;
}

export class OrdenPerdidasParamsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  ordenId: number;
}
