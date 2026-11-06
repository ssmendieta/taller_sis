export interface GuardarRutaParadaDto {
  destino: string;
  boletaIds: string[];
}

// La secuencia de cada parada es su posición en la lista (1, 2, 3...).
export interface GuardarRutaDto {
  grupoId: string | null;
  fechaProgramada: string;
  vehiculoExternoId: string;
  choferExternoId: string;
  paradas: GuardarRutaParadaDto[];
}
