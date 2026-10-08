import PageHeader from "../components/ui/PageHeader.jsx";

const boleta = {
  numero: "BOL-0001",
  fecha: "08/10/2026",
  destino: "Área de Producción",
  responsable: "Encargado de Logística",
  naturaleza: "DESPACHO",
  items: [
    {
      material: "Materia prima A",
      cantidad: "10",
      unidad: "kg",
    },
    {
      material: "Material B",
      cantidad: "5",
      unidad: "unidades",
    },
  ],
};

const leyenda = [
  {
    codigo: "TRASLADO",
    descripcion: "Movimiento interno de materiales entre áreas o ubicaciones.",
  },
  {
    codigo: "DESPACHO",
    descripcion: "Salida de materiales hacia un destino autorizado.",
  },
  {
    codigo: "ENTREGA",
    descripcion: "Entrega de materiales al responsable o destino correspondiente.",
  },
];

export default function BoletaDetallePage() {
  return (
    <section className="ts-page" aria-labelledby="boleta-title">
      <PageHeader
        titulo="Detalle de boleta"
        conteo="Boleta emitida"
      />

      <div className="ts-panel">
        <div className="ts-panel-title">
          <div>
            <h2 id="boleta-title">Boleta {boleta.numero}</h2>
            <p>Documento de salida</p>
          </div>

          <strong>EMITIDA</strong>
        </div>

        <div className="ts-filters">
          <div>
            <strong>Número</strong>
            <p>{boleta.numero}</p>
          </div>

          <div>
            <strong>Fecha</strong>
            <p>{boleta.fecha}</p>
          </div>

          <div>
            <strong>Destino</strong>
            <p>{boleta.destino}</p>
          </div>

          <div>
            <strong>Responsable</strong>
            <p>{boleta.responsable}</p>
          </div>

          <div>
            <strong>Naturaleza documental</strong>
            <p>{boleta.naturaleza}</p>
          </div>
        </div>
      </div>

      <div className="ts-panel" style={{ marginTop: "1rem" }}>
        <div className="ts-panel-title">
          <h3>Ítems definitivos</h3>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="ts-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Cantidad</th>
                <th>Unidad</th>
              </tr>
            </thead>

            <tbody>
              {boleta.items.map((item) => (
                <tr key={`${item.material}-${item.unidad}`}>
                  <td>{item.material}</td>
                  <td>{item.cantidad}</td>
                  <td>{item.unidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ts-panel" style={{ marginTop: "1rem" }}>
        <div className="ts-panel-title">
          <h3>Leyenda de naturaleza documental</h3>
        </div>

        <p>
          La naturaleza documental identifica el tipo de movimiento registrado
          en la boleta.
        </p>

        <div className="ts-filters">
          {leyenda.map((item) => (
            <div key={item.codigo}>
              <strong>{item.codigo}</strong>
              <p>{item.descripcion}</p>
            </div>
          ))}
        </div>
      </div>

      <div
        className="ts-panel"
        style={{ marginTop: "1rem" }}
        role="note"
      >
        <strong>Importante</strong>
        <p>
          Esta boleta representa un documento de salida emitido. No se presenta
          como constancia de entrega final.
        </p>
      </div>
    </section>
  );
}
