import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { EstadoOrden } from './estado-orden.enum';

export class CambiarEstadoOrdenDto {
  // Lo establece el controlador a partir de la sesión verificada, no el cliente.
  usuarioResponsableId?: number;
  @IsEnum(EstadoOrden)
  nuevoEstado: EstadoOrden;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;

}
