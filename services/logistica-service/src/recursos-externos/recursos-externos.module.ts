import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ErpRecursosClient } from './clientes/erp-recursos.client';
import { ERP_RECURSOS_CONFIG, loadErpRecursosConfig } from './clientes/erp-recursos.config';
import { RecursoExternoChofer } from './entities/recurso-externo-chofer.entity';
import { RecursoExternoSnapshot } from './entities/recurso-externo-snapshot.entity';
import { RecursoExternoVehiculo } from './entities/recurso-externo-vehiculo.entity';
import { RecursosLogisticosController } from './recursos-logisticos.controller';
import { RecursosLogisticosService } from './recursos-logisticos.service';
import { RESPALDO_RECURSOS_LOGISTICOS } from './respaldo-recursos';
import { RespaldoRecursosTypeOrmService } from './respaldo-recursos.service';

// ABC-115: consulta de vehículos y choferes del ERP con respaldo persistente (ABC-352).
@Module({
  imports: [TypeOrmModule.forFeature([RecursoExternoSnapshot, RecursoExternoVehiculo, RecursoExternoChofer])],
  controllers: [RecursosLogisticosController],
  providers: [
    { provide: ERP_RECURSOS_CONFIG, useFactory: () => loadErpRecursosConfig() },
    ErpRecursosClient,
    RespaldoRecursosTypeOrmService,
    // ABC-352: proveedor de respaldo persistido en base de datos local
    { provide: RESPALDO_RECURSOS_LOGISTICOS, useExisting: RespaldoRecursosTypeOrmService },
    RecursosLogisticosService,
  ],
  exports: [
    ErpRecursosClient,
    RecursosLogisticosService,
    RespaldoRecursosTypeOrmService,
    RESPALDO_RECURSOS_LOGISTICOS,
  ],
})
export class RecursosExternosModule {}
