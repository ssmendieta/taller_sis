import { Routes, Route } from "react-router-dom";
import HomePage from "../pages/HomePage.jsx";
import LoginPage from "../pages/LoginPage.jsx";
import ProduccionPage from "../pages/ProduccionPage.jsx";
import LogisticaPage from "../pages/LogisticaPage.jsx";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/produccion" element={<ProduccionPage />} />
      <Route path="/logistica" element={<LogisticaPage />} />
    </Routes>
  );
}
