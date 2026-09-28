import { Type } from 'class-transformer';
import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class CreateAvancesProduccionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orden_id!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(9999999999.9999)
  cantidad_producida!: number;

}
