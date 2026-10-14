const PREFIJO_BOLETA = "boleta-";

export function guardarBoletaLocal(boleta) {
  if (!boleta?.id) {
    throw new Error("No se puede guardar una boleta sin identificador.");
  }

  sessionStorage.setItem(
    `${PREFIJO_BOLETA}${boleta.id}`,
    JSON.stringify(boleta)
  );

  return boleta;
}