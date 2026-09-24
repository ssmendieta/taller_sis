import { PartialType } from '@nestjs/mapped-types';
import { CreateAvancesProduccionDto } from './create-avances_produccion.dto';

export class UpdateAvancesProduccionDto extends PartialType(CreateAvancesProduccionDto) {}
