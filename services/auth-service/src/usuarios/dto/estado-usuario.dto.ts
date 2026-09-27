import { IsBoolean } from 'class-validator';

export class EstadoUsuarioDto {
  @IsBoolean()
  activo!: boolean;
}
