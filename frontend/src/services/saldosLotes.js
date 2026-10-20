// Saldos documentales de los lotes de una orden y límites de las solicitudes de
// salida. Son funciones puras (sin React) para que la pantalla de Logística y las
// pruebas usen exactamente los mismos cálculos que el backend.

const ESCALA = 10000n;

// "12.5000" -> 125000n. Devuelve null si el texto no es un decimal válido.
export function escalarCantidad(valor) {
  if (valor === null || valor === undefined) return null;
  const limpio = String(valor).trim();
  if (!/^\d+(?:\.\d{1,4})?$/.test(limpio)) return null;
  const [entero, decimales = ""] = limpio.split(".");
  return BigInt(entero) * ESCALA + BigInt(decimales.padEnd(4, "0"));
}

// 400000n -> "40" y 400050n -> "40.005"
export function formatearEscalada(valor) {
  if (valor === null || valor === undefined) return "";
  const negativo = valor < 0n;
  const absoluto = negativo ? -valor : valor;
  const entero = absoluto / ESCALA;
  const resto = absoluto % ESCALA;
  const decimales = resto.toString().padStart(4, "0").replace(/0+$/, "");
  const texto = decimales ? `${entero}.${decimales}` : `${entero}`;
  return negativo ? `-${texto}` : texto;
}

// Saldo real del backend para un lote: original, comprometido y disponible.
export function saldoDeLote(saldos, referencia) {
  const lista = Array.isArray(saldos) ? saldos : [];
  const encontrado = lista.find((saldo) => String(saldo?.referencia) === String(referencia));
  if (!encontrado) return null;
  return {
    referencia: encontrado.referencia,
    cantidadOriginal: encontrado.cantidadOriginal ?? "0",
    cantidadComprometida: encontrado.cantidadComprometida ?? "0",
    cantidadDisponible: encontrado.cantidadDisponible ?? "0",
  };
}

// Cantidad que se precarga en el formulario: todo lo disponible del lote.
export function cantidadSugerida(saldo) {
  if (!saldo) return "";
  const disponible = escalarCantidad(saldo.cantidadDisponible);
  if (disponible === null || disponible <= 0n) return "";
  return formatearEscalada(disponible);
}

// Valida la cantidad elegida contra la disponibilidad real del lote.
export function validarCantidadLote(cantidad, saldo, referencia = "") {
  const delLote = referencia ? ` del lote ${referencia}` : "";
  if (cantidad === null || cantidad === undefined || String(cantidad).trim() === "") {
    return { valido: false, mensaje: `Ingresa la cantidad a solicitar${delLote}.` };
  }
  const valor = escalarCantidad(String(cantidad).trim());
  if (valor === null) {
    return { valido: false, mensaje: "La cantidad debe ser positiva y admitir hasta cuatro decimales." };
  }
  if (valor <= 0n) {
    return { valido: false, mensaje: "La cantidad debe ser mayor que cero." };
  }
  if (!saldo) {
    return { valido: false, mensaje: `No se pudo consultar la disponibilidad${delLote}.` };
  }
  const disponible = escalarCantidad(saldo.cantidadDisponible);
  if (disponible === null) {
    return { valido: false, mensaje: `La disponibilidad${delLote} no es válida.` };
  }
  if (disponible <= 0n) {
    return { valido: false, mensaje: `El lote ${referencia} no tiene unidades disponibles.` };
  }
  if (valor > disponible) {
    return {
      valido: false,
      mensaje: `La cantidad supera las unidades disponibles${delLote} (máximo ${formatearEscalada(disponible)}).`,
    };
  }
  return { valido: true, mensaje: "" };
}

// Cantidad autorizada por la solicitud de salida para un lote.
export function cantidadAutorizadaPorSolicitud(items, referencia) {
  const lista = Array.isArray(items) ? items : [];
  const total = lista
    .filter((item) => String(item?.referencia) === String(referencia))
    .reduce((suma, item) => suma + (escalarCantidad(item?.cantidad) ?? 0n), 0n);
  return total;
}

// Valida la cantidad de una boleta contra lo autorizado por su solicitud.
export function validarCantidadContraSolicitud(cantidad, items, referencia = "") {
  const autorizada = cantidadAutorizadaPorSolicitud(items, referencia);
  if (autorizada <= 0n) {
    return {
      valido: false,
      mensaje: `La solicitud de salida no autoriza el lote ${referencia}.`,
    };
  }
  if (cantidad === null || cantidad === undefined || String(cantidad).trim() === "") {
    return { valido: false, mensaje: "Ingresa la cantidad de la boleta." };
  }
  const valor = escalarCantidad(String(cantidad).trim());
  if (valor === null || valor <= 0n) {
    return { valido: false, mensaje: "La cantidad debe ser positiva y admitir hasta cuatro decimales." };
  }
  if (valor > autorizada) {
    return {
      valido: false,
      mensaje: `La cantidad del lote ${referencia} supera la autorizada en la solicitud de salida (máximo ${formatearEscalada(autorizada)}).`,
    };
  }
  return { valido: true, mensaje: "" };
}
