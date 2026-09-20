import { useEffect, useState } from "react";
import { apiConfig } from "../services/api.js";

export default function SystemStatus() {
  const [gateway, setGateway] = useState("Cargando...");
  const [produccion, setProduccion] = useState("Cargando...");
  const [database, setDatabase] = useState("Cargando...");
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function check() {
      // Gateway health
      try {
        const res = await fetch(`${apiConfig.gatewayUrl}/health`);
        setGateway(res.ok ? "OK" : `Error ${res.status}`);
      } catch {
        setGateway("Error");
      }
      // Producción via gateway
      try {
        const res = await fetch(`${apiConfig.gatewayUrl}/api/produccion/health`);
        setProduccion(res.ok ? "OK" : `Error ${res.status}`);
      } catch {
        setProduccion("Error");
      }
      // Producción -> DB (endpoint real PG)
      try {
        const res = await fetch(`${apiConfig.gatewayUrl}/api/produccion/health/database`);
        const data = await res.json();
        setRaw(data);
        if (data.database === "connected") setDatabase("OK");
        else if (data.database === "skipped") setDatabase("OK (skipped - sin PG)");
        else if (data.database === "disconnected") setDatabase("Error");
        else setDatabase(data.database || "Desconocido");
        if (!res.ok && data.status === "error") setError(data.error);
      } catch (e) {
        setDatabase("Error");
        setError(e.message);
      }
    }
    check();
  }, []);

  return (
    <div style={{ border: "1px solid #ddd", padding: 16, borderRadius: 8, maxWidth: 500 }}>
      <h3>Estado del sistema</h3>
      <p>Gateway: <strong>{gateway}</strong></p>
      <p>Producción: <strong>{produccion}</strong></p>
      <p>Base de datos: <strong>{database}</strong></p>
      {raw && <pre style={{ background: "#f5f5f5", padding: 8, fontSize: 12, overflow: "auto" }}>{JSON.stringify(raw, null, 2)}</pre>}
      {error && <p style={{ color: "red", fontSize: 12 }}>Error: {error}</p>}
      <p style={{ fontSize: 11, color: "#666" }}>Flujo: Frontend → Gateway → Producción → PostgreSQL (produccion_db)</p>
    </div>
  );
}
