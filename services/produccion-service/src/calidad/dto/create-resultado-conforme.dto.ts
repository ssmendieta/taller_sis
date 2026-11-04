import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { TipoResultadoCalidad } from '../entities/tipo-resultado-calidad.enum';

export class CreateResultadoConformeDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  ordenId: number;

  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(9999999999.9999)
  cantidad: number;

  @IsOptional()
  @IsEnum(TipoResultadoCalidad)
  tipo?: TipoResultadoCalidad;

  @ValidateIf((dto) => dto.tipo === TipoResultadoCalidad.DEFECTUOSO || dto.causaDefecto !== undefined)
  @IsString()
  @Matches(/\S/, { message: 'La causa del defecto es obligatoria y no puede estar vacía' })
  @MaxLength(500)
  causaDefecto?: string;
}
