import { Module } from '@nestjs/common';
import { ErpRecursosClient } from './clientes/erp-recursos.client';
import { ERP_RECURSOS_CONFIG, loadErpRecursosConfig } from './clientes/erp-recursos.config';

// ABC-115: consulta de vehículos y choferes del ERP. La API y la copia de
// respaldo se agregan en las subtareas siguientes usando este cliente.
@Module({
  providers: [
    { provide: ERP_RECURSOS_CONFIG, useFactory: () => loadErpRecursosConfig() },
    ErpRecursosClient,
  ],
  exports: [ErpRecursosClient],
})
export class RecursosExternosModule {}
