export function mensajeErrorSalida(error, permiso) {
  const detalle = error?.message || "No se pudo completar la operación.";
  const estado = error?.status ? `HTTP ${error.status}: ` : "";
  const ayuda = error?.status === 401 ? " Vuelve a iniciar sesión."
    : error?.status === 403 && permiso ? ` Permiso necesario: ${permiso}.` : "";
  return `${estado}${detalle}${ayuda}`;
}

export function datosSolicitudSalida({ orden, lotes, items, destinoDocumental, motivo }) {
  if (!orden || !/^\d+$/.test(String(orden.id)) || BigInt(orden.id) <= 0n) {
    throw new Error("Selecciona una orden de producción del listado.");
  }
  const destino = destinoDocumental.trim();
  const razon = motivo.trim();
  if (!destino || destino.length > 250) throw new Error("El destino es obligatorio y admite hasta 250 caracteres.");
  if (!razon || razon.length > 500) throw new Error("El motivo es obligatorio y admite hasta 500 caracteres.");
  if (!items.length) throw new Error("Agrega al menos un ítem de un lote de la orden.");
  const referencias = new Set();
  const detalle = items.map(({ referencia, cantidad }) => {
    if (!lotes.some((lote) => String(lote.ordenId) === String(orden.id) && lote.codigo === referencia)) {
      throw new Error("Selecciona una referencia de lote de la orden consultada.");
    }
    if (referencias.has(referencia)) throw new Error("No repitas un lote dentro de la solicitud.");
    referencias.add(referencia);
    if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/.test(cantidad) || /^0(?:\.0{1,4})?$/.test(cantidad)) {
      throw new Error("Cada cantidad debe ser positiva y admitir hasta cuatro decimales.");
    }
    const [entero, decimal = ""] = cantidad.split(".");
    return { referencia, cantidad: `${entero}.${decimal.padEnd(4, "0")}` };
  });
  return { ordenId: String(orden.id), destinoDocumental: destino, motivo: razon, items: detalle };
}
