export function mostrarCantidad(valor) {
  const numero = Number(valor);
  return valor == null || valor === "" || !Number.isFinite(numero)
    ? "—"
    : new Intl.NumberFormat("es-BO", { maximumFractionDigits: 4 }).format(numero);
}

export function mostrarFecha(valor) {
  return valor ? String(valor).slice(0, 10) : "—";
}

export function mostrarFechaHora(valor, zona = "America/La_Paz") {
  if (!valor) return { fecha: "—", hora: "—" };
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return { fecha: "—", hora: "—" };
  return {
    fecha: new Intl.DateTimeFormat("es-BO", { timeZone: zona, day: "2-digit", month: "2-digit", year: "numeric" }).format(fecha),
    hora: new Intl.DateTimeFormat("es-BO", { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false }).format(fecha),
  };
}

export function mostrarEstadoOrden(valor) {
  const mapa = {
    PENDIENTE: "Pendiente",
    PLANIFICADA: "Planificada",
    EN_PRODUCCION: "En producción",
    FINALIZADA: "Finalizada",
    CANCELADA: "Cancelada",
  };
  if (!valor) return "—";
  return mapa[valor] ?? String(valor).replaceAll("_", " ");
}

export function nombreProductoOrden(orden) {
  return (
    orden?.producto_nombre ??
    orden?.producto?.nombre ??
    orden?.receta?.producto_nombre ??
    orden?.codigo ??
    "—"
  );
}

export function responsableOrden(orden) {
  return (
    orden?.responsable_nombre ??
    orden?.responsable?.nombre ??
    orden?.responsable?.nombre_completo ??
    (orden?.responsable_usuario_id ?? orden?.responsableUsuarioId
      ? `Usuario ${orden.responsable_usuario_id ?? orden.responsableUsuarioId}`
      : "—")
  );
}

export function cantidadSolicitadaOrden(orden) {
  return orden?.cantidad_solicitada ?? orden?.cantidadSolicitada ?? orden?.cantidad ?? null;
}

export function fechaProgramadaOrden(orden) {
  return orden?.fecha_programada ?? orden?.fechaProgramada ?? null;
}

export function totalProducidoDe(respuesta) {
  if (respuesta == null) return 0;
  if (typeof respuesta === "number") return respuesta;
  const candidatos = [
    respuesta.total,
    respuesta.total_producido,
    respuesta.totalProducido,
    respuesta.acumulado,
    respuesta.cantidad_total,
    respuesta.cantidadTotal,
  ];
  for (const valor of candidatos) {
    const numero = Number(valor);
    if (Number.isFinite(numero)) return numero;
  }
  return 0;
}

export function historialNormalizado(lista) {
  const filas = Array.isArray(lista) ? lista : lista?.data ?? lista?.items ?? [];
  return (Array.isArray(filas) ? filas : []).map((h, indice) => ({
    id: h.id ?? `${h.orden_id ?? h.ordenId ?? "h"}-${indice}`,
    anterior: h.estado_anterior ?? h.estadoAnterior ?? null,
    nuevo: h.estado_nuevo ?? h.estadoNuevo ?? h.estado ?? "—",
    usuario: h.usuario_responsable_nombre ?? h.usuarioResponsableNombre ?? (h.usuario_responsable_id ?? h.usuarioResponsableId ? `Usuario ${h.usuario_responsable_id ?? h.usuarioResponsableId}` : "Sistema"),
    fechaHora: h.fecha_hora ?? h.fechaHora ?? null,
    motivo: h.motivo ?? "",
  }));
}

export function materialesNormalizados(respuesta) {
  const lista = Array.isArray(respuesta) ? respuesta : respuesta?.materiales ?? respuesta?.data ?? [];
  return (Array.isArray(lista) ? lista : []).map((m, indice) => ({
    id: m.material_id ?? m.materialId ?? m.id ?? indice,
    codigo: m.codigo ?? m.materialCodigo ?? `MAT-${m.material_id ?? indice}`,
    nombre: m.nombre ?? m.materialNombre ?? `Material ${m.material_id ?? indice}`,
    unidad: m.unidad_medida ?? m.unidadMedida ?? "",
    requerida: Number(m.cantidad_requerida ?? m.cantidadRequerida ?? m.cantidadTotal ?? m.cantidad_total ?? 0),
    disponible: m.cantidad_disponible ?? m.cantidadDisponible ?? null,
    estado: m.estado ?? null,
  }));
}
