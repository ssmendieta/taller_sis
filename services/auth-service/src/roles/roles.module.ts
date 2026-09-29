import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rol} from './entities/role.entity';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { AuthzModule } from '../authz/authz.module';

@Module({
  imports: [TypeOrmModule.forFeature([Rol]), AuthzModule],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
