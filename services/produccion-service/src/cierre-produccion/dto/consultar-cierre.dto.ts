import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class ConsultarCierreParamsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  ordenId: number;
}

export class ConsultarCierreQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  cierreVersion: number = 1;
}
