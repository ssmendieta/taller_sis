import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { EstadoOrden } from './estado-orden.enum';

export class CambiarEstadoOrdenDto {
  @IsEnum(EstadoOrden)
  nuevoEstado: EstadoOrden;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;

}
