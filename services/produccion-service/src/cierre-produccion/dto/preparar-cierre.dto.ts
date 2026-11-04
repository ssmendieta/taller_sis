import { IsInt, Max, Min } from 'class-validator';

export class PrepararCierreDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  ordenId: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  cierreVersion: number = 1;
}
