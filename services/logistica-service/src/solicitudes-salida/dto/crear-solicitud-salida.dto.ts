export interface CrearSolicitudSalidaDto {
  ordenId: string;
  destinoDocumental: string;
  motivo: string;
  items: Array<{ referencia: string; cantidad: string }>;
}
