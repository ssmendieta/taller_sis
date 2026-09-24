import { PartialType } from '@nestjs/mapped-types';
import { CreateOrdenesProduccionDto } from './create-ordenes_produccion.dto';

export class UpdateOrdenesProduccionDto extends PartialType(CreateOrdenesProduccionDto) {}
