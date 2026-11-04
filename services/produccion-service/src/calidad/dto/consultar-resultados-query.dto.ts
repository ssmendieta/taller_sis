import { IsEnum, IsOptional } from 'class-validator';
import { TipoResultadoCalidad } from '../entities/tipo-resultado-calidad.enum';

export class ConsultarResultadosQueryDto {
  @IsOptional()
  @IsEnum(TipoResultadoCalidad)
  tipo?: TipoResultadoCalidad;
}
