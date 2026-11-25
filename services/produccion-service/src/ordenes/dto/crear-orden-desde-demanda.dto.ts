import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CrearOrdenDesdeDemandaDto {
  @IsOptional()
  @IsString({ message: 'El código de producto debe ser texto' })
  @MaxLength(80, { message: 'El código de producto no puede exceder 80 caracteres' })
  producto_codigo?: string;
}
