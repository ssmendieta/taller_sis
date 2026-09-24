import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permisos} from './entities/permiso.entity';
import { PermisosService } from './permisos.service';
import { PermisosController } from './permisos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Permisos])],
  controllers: [PermisosController],
  providers: [PermisosService],
})
export class PermisosModule {}
