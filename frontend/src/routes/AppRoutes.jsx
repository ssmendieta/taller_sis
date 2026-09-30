import { Routes, Route } from "react-router-dom";
import HomePage from "../pages/HomePage.jsx";
import LoginPage from "../pages/LoginPage.jsx";
import ProduccionPage from "../pages/ProduccionPage.jsx";
import ConsultaOrdenesPage from "../pages/ConsultaOrdenesPage.jsx";
import ConsultaAuditoriaPage from "../pages/ConsultaAuditoriaPage.jsx";
import OrdenesPage from "../pages/OrdenesPage.jsx";
import LogisticaPage from "../pages/LogisticaPage.jsx";
import SystemStatusPage from "../pages/SystemStatusPage.jsx";
import RecetasPage from "../pages/RecetasPage.jsx";
import RolesPage from "../pages/RolesPage.jsx";
import UsuarioPage from "../pages/UsuarioPage.jsx";
import OrdenPage from "../pages/OrdenPage.jsx";
import ProtectedRoute from "../components/auth/ProtectedRoute.jsx";

const PRODUCCION = ["Encargado de Producción"];
const ADMINISTRADOR = ["Administrador"];
const CONSULTA_ORDENES = ["Supervisor", ...PRODUCCION];
const privada = (pagina, roles) => <ProtectedRoute roles={roles}>{pagina}</ProtectedRoute>;
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/produccion" element={privada(<ProduccionPage />, PRODUCCION)} />
      <Route path="/produccion/ordenes" element={privada(<ConsultaOrdenesPage />, CONSULTA_ORDENES)} />
      <Route path="/produccion/avances" element={privada(<OrdenesPage />, PRODUCCION)} />
      <Route path="/auditoria" element={privada(<ConsultaAuditoriaPage />, ADMINISTRADOR)} />
      <Route path="/recetas" element={privada(<RecetasPage />, PRODUCCION)} />
      <Route path="/logistica" element={<LogisticaPage />} />
      <Route path="/estado" element={<SystemStatusPage />} />
      <Route path="/roles" element={privada(<RolesPage />, ADMINISTRADOR)} />
      <Route path="/usuarios" element={privada(<UsuarioPage />, ADMINISTRADOR)} />
      <Route path="/ordenes" element={privada(<OrdenPage />, PRODUCCION)} />
    </Routes>
  );
}
