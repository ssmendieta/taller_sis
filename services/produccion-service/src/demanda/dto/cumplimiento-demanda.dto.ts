export interface OrdenCumplimientoDemandaDto {
  id: number;
  codigo: string;
  productoId: number;
  estado: string;
  cantidadSolicitada: number;
  cantidadProducida: number;
  fechaProgramada: string;
  creadoEn: string;
}

export interface CumplimientoDemandaDto {
  demandaId: string;
  origen: string;
  demandaExternaId: string;
  estado: string;
  fechaRequerida: string;
  cantidadPedida: number;
  cantidadProducida: number;
  porcentajeCumplido: number;
  ordenes: OrdenCumplimientoDemandaDto[];
}
