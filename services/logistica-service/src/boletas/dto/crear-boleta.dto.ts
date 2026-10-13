export interface CrearBoletaDto {
  solicitudSalidaId: string;
  items: Array<{ referencia: string; cantidad: string }>;
}
