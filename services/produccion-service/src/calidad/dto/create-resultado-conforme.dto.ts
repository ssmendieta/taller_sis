import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class CreateResultadoConformeDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  ordenId: number;

  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(9999999999.9999)
  cantidad: number;
}
