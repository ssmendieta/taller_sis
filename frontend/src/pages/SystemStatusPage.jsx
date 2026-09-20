import SystemStatus from "../components/SystemStatus.jsx";

export default function SystemStatusPage() {
  return (
    <div>
      <h1>Estado del Sistema</h1>
      <p>Verificación técnica end-to-end: Frontend → Gateway → Producción → PostgreSQL</p>
      <SystemStatus />
    </div>
  );
}
