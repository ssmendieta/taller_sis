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
import MaterialesPage from "../pages/MaterialesPage.jsx";
import RolesPage from "../pages/RolesPage.jsx";
import UsuarioPage from "../pages/UsuarioPage.jsx";
import OrdenPage from "../pages/OrdenPage.jsx";
import ProtectedRoute from "../components/auth/ProtectedRoute.jsx";

const privada = (pagina, permisos) => <ProtectedRoute permisos={permisos}>{pagina}</ProtectedRoute>;
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/produccion" element={privada(<ProduccionPage />, ["ordenes.crear", "ordenes.consultar", "ordenes.registrar_avance"])} />
      <Route path="/produccion/ordenes" element={privada(<ConsultaOrdenesPage />, ["ordenes.consultar"])} />
      <Route path="/produccion/avances" element={privada(<OrdenesPage />, ["ordenes.registrar_avance"])} />
      <Route path="/auditoria" element={privada(<ConsultaAuditoriaPage />, ["auditoria.consultar"])} />
      <Route path="/recetas" element={privada(<RecetasPage />, ["recetas.gestionar"])} />
      <Route path="/materiales" element={privada(<MaterialesPage />, ["materiales.consultar_disponibilidad", "recetas.gestionar"])} />
      <Route path="/logistica" element={<LogisticaPage />} />
      <Route path="/estado" element={<SystemStatusPage />} />
      <Route path="/roles" element={privada(<RolesPage />, ["roles_permisos.gestionar"])} />
      <Route path="/usuarios" element={privada(<UsuarioPage />, ["usuarios.gestionar"])} />
      <Route path="/ordenes" element={privada(<OrdenPage />, ["ordenes.crear"])} />
    </Routes>
  );
}
