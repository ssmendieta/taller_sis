export interface ReporteProduccionQueryDto {
  fechaDesde?: string;
  fechaHasta?: string;
  producto?: string;
}

export interface CantidadesProduccionDto {
  solicitada: string;
  producida: string;
  conforme: string;
  defectuosa: string;
  reprocesada: string;
  recuperada: string;
  descartada: string;
}

export interface ProductoReporteDto {
  recetaId: number;
  codigo: string | null;
  nombre: string | null;
  unidad: string | null;
}

export interface MaterialReporteDto {
  materialId: string;
  unidad: string;
  cantidad: string;
}

export interface OrdenReporteDto {
  ordenId: number;
  codigo: string;
  fechaProgramada: string;
  producto: ProductoReporteDto;
  fuente: 'CIERRE' | 'REGISTROS';
  cierre: { id: string; version: number } | null;
  cantidades: CantidadesProduccionDto;
  consumos: MaterialReporteDto[];
  perdidas: MaterialReporteDto[];
}

export interface ReporteProduccionDto {
  filtros: { fechaDesde: string | null; fechaHasta: string | null; producto: string | null; campoFecha: 'fecha_programada' };
  ordenes: OrdenReporteDto[];
  totales: {
    ordenes: number;
    productos: Array<{ producto: ProductoReporteDto; cantidades: CantidadesProduccionDto }>;
    consumos: MaterialReporteDto[];
    perdidas: MaterialReporteDto[];
  };
}
