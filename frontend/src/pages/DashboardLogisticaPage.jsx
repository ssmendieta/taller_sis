import { useEffect } from "react";
import { useSesion } from "../context/SesionContext.jsx";
import { tienePermiso } from "../services/permisos.js";
import { PERMISO_CONSULTAR_RUTAS } from "../services/historialLogisticoService.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import WidgetsDashboardLogistica from "../components/logistica/dashboard/WidgetsDashboardLogistica.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";

// ABC-107: tablero logístico. ABC-330 aporta los widgets; ABC-329 completará la maqueta.
export default function DashboardLogisticaPage() {
  const { usuario } = useSesion();

  useEffect(() => {
    document.title = FORMATO_TITULO("Tablero logístico");
  }, []);

  if (!tienePermiso(usuario, PERMISO_CONSULTAR_RUTAS)) {
    return <p className="ts-feedback ts-error" role="alert">No tienes permiso para consultar el tablero logístico.</p>;
  }

  return (
    <section className="ts-page" aria-labelledby="dash-logistica-titulo">
      <PageHeader
        titulo={<span id="dash-logistica-titulo">Tablero logístico</span>}
        descripcion="Boletas, rutas y entregas del período seleccionado."
      />
      <WidgetsDashboardLogistica />
    </section>
  );
}
