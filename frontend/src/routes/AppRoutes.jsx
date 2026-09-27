import { Routes, Route } from "react-router-dom";
import HomePage from "../pages/HomePage.jsx";
import LoginPage from "../pages/LoginPage.jsx";
import ProduccionPage from "../pages/ProduccionPage.jsx";
import ConsultaOrdenesPage from "../pages/ConsultaOrdenesPage.jsx";
import ConsultaAuditoriaPage from "../pages/ConsultaAuditoriaPage.jsx";
import LogisticaPage from "../pages/LogisticaPage.jsx";
import SystemStatusPage from "../pages/SystemStatusPage.jsx";
import RecetasPage from "../pages/RecetasPage.jsx";
import RolesPage from "../pages/RolesPage.jsx";
import UsuarioPage from "../pages/UsuarioPage.jsx";
import OrdenPage from "../pages/OrdenPage.jsx";
// ProtectedRoute queda sin usar hasta que exista login (envolver rutas ahora las redirigiría todas a /login).
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/produccion" element={<ProduccionPage />} />
      <Route path="/produccion/ordenes" element={<ConsultaOrdenesPage />} />
      <Route path="/auditoria" element={<ConsultaAuditoriaPage />} />
      <Route path="/recetas" element={<RecetasPage />} />
      <Route path="/logistica" element={<LogisticaPage />} />
      <Route path="/estado" element={<SystemStatusPage />} />
      <Route path="/roles" element={<RolesPage />} />
      <Route path="/usuarios" element={<UsuarioPage />} />
      <Route path="/ordenes" element={<OrdenPage />} />
    </Routes>
  );
}