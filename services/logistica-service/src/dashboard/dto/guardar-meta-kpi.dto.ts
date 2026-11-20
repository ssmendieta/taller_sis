import { IsNumber, IsPositive, Max, Min, ValidateIf } from 'class-validator';

export class GuardarMetaKpiDto {
  /** null borra la meta: el KPI queda sin semáforo. */
  @ValidateIf((o: GuardarMetaKpiDto) => o.meta !== null)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 }, { message: 'La meta debe ser un número o null.' })
  @IsPositive({ message: 'La meta debe ser mayor que cero.' })
  @Max(9999999999, { message: 'La meta es demasiado grande.' })
  meta: number | null;

  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }, { message: 'El umbral amarillo debe ser un número.' })
  @Min(0, { message: 'El umbral amarillo no puede ser negativo.' })
  @Max(9999.99, { message: 'El umbral amarillo es demasiado grande.' })
  umbralAmarilloPct: number;

  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }, { message: 'El umbral rojo debe ser un número.' })
  @Min(0, { message: 'El umbral rojo no puede ser negativo.' })
  @Max(9999.99, { message: 'El umbral rojo es demasiado grande.' })
  umbralRojoPct: number;
}
