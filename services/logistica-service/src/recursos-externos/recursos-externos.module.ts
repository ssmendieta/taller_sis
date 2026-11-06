import { Module } from '@nestjs/common';
import { ErpRecursosClient } from './clientes/erp-recursos.client';
import { ERP_RECURSOS_CONFIG, loadErpRecursosConfig } from './clientes/erp-recursos.config';
import { RecursosLogisticosController } from './recursos-logisticos.controller';
import { RecursosLogisticosService } from './recursos-logisticos.service';
import { RESPALDO_RECURSOS_LOGISTICOS, SIN_RESPALDO_RECURSOS } from './respaldo-recursos';

// ABC-115: consulta de vehículos y choferes del ERP.
@Module({
  controllers: [RecursosLogisticosController],
  providers: [
    { provide: ERP_RECURSOS_CONFIG, useFactory: () => loadErpRecursosConfig() },
    ErpRecursosClient,
    // ABC-352 reemplaza este proveedor por la copia de respaldo persistida.
    { provide: RESPALDO_RECURSOS_LOGISTICOS, useValue: SIN_RESPALDO_RECURSOS },
    RecursosLogisticosService,
  ],
  exports: [ErpRecursosClient, RecursosLogisticosService],
})
export class RecursosExternosModule {}
