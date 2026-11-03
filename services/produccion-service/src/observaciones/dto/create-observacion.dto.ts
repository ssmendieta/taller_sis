import { IsEnum, IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { TipoObservacion } from '../entities/tipo-observacion.enum';

export class CreateObservacionDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  ordenId: number;

  @IsEnum(TipoObservacion, { message: 'El tipo debe ser OBSERVACION o INCIDENCIA' })
  tipo: TipoObservacion;

  @IsString()
  @Matches(/\S/, { message: 'La descripción es obligatoria y no puede estar vacía' })
  @MaxLength(1000)
  descripcion: string;
}
