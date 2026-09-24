import { Routes, Route } from "react-router-dom";

import HomePage from "../pages/HomePage.jsx";
import LoginPage from "../pages/LoginPage.jsx";
import ProduccionPage from "../pages/ProduccionPage.jsx";
import LogisticaPage from "../pages/LogisticaPage.jsx";
import SystemStatusPage from "../pages/SystemStatusPage.jsx";
import RecetasPage from "../pages/RecetasPage.jsx";

import ProtectedRoute from "../components/auth/ProtectedRoute.jsx";


export default function AppRoutes() {

  return (

    <Routes>

      <Route path="/" element={<HomePage />} />

      <Route path="/login" element={<LoginPage />} />


      <Route
        path="/produccion"
        element={
          <ProtectedRoute roles={["ADMIN","OPERADOR"]}>
            <ProduccionPage />
          </ProtectedRoute>
        }
      />


      <Route
        path="/recetas"
        element={
          <ProtectedRoute roles={["ADMIN"]}>
            <RecetasPage />
          </ProtectedRoute>
        }
      />


      <Route
        path="/logistica"
        element={
          <ProtectedRoute roles={["ADMIN","LOGISTICA"]}>
            <LogisticaPage />
          </ProtectedRoute>
        }
      />


      <Route
        path="/estado"
        element={
          <ProtectedRoute roles={["ADMIN"]}>
            <SystemStatusPage />
          </ProtectedRoute>
        }
      />


    </Routes>

  );

}