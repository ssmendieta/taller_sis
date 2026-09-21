import { Routes, Route } from "react-router-dom";
import HomePage from "../pages/HomePage.jsx";
import LoginPage from "../pages/LoginPage.jsx";
import ProduccionPage from "../pages/ProduccionPage.jsx";
import LogisticaPage from "../pages/LogisticaPage.jsx";
import SystemStatusPage from "../pages/SystemStatusPage.jsx";
import RecetasPage from "../pages/RecetasPage.jsx";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/produccion" element={<ProduccionPage />} />
      <Route path="/recetas" element={<RecetasPage />} />
      <Route path="/logistica" element={<LogisticaPage />} />
      <Route path="/estado" element={<SystemStatusPage />} />
    </Routes>
  );
}