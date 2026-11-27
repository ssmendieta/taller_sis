import { useEffect } from "react";
import PageHeader from "../components/ui/PageHeader.jsx";
import TarjetasKpi from "../components/kpis/TarjetasKpi.jsx";
import WidgetFpy from "../components/produccion/WidgetFpy.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";

// ABC-497: página mínima que aloja los KPIs de Producción. Los demás widgets se agregan aquí.
export default function DashboardProduccionPage() {
  useEffect(() => {
    document.title = FORMATO_TITULO("Tablero de producción");
  }, []);

  return (
    <section className="ts-page" aria-label="Tablero de producción">
      <PageHeader titulo="Tablero de producción" descripcion="KPIs de producción frente a su meta." />
      <TarjetasKpi area="produccion" />
      <WidgetFpy />
    </section>
  );
}
