import React, { useState } from "react";
import "../styles/LoginPage.css";
import { apiConfig } from "../services/api";

function LoginPage() {
  const [correo, setCorreo] = useState("");
  const [contraseña, setContraseña] = useState("");
  const [error, setError] = useState("");
  const [mostrarContraseña, setMostrarContraseña] = useState(false);
  const [cargando, setCargando] = useState(false);

  const manejarSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!correo.trim()) {
      setError("Ingresa tu correo electrónico.");
      return;
    }

    if (!contraseña.trim()) {
      setError("Ingresa tu contraseña.");
      return;
    }

    setCargando(true);

    try {
      const respuesta = await fetch(`${apiConfig.gatewayUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          correo,
          password: contraseña,
        }),
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          datos.message || "Correo o contraseña incorrectos."
        );
      }

      // Guardar sesión
      localStorage.setItem("usuario", JSON.stringify(datos.usuario));

      // Ir a la página principal
      window.location.href = "/";
    } catch (error) {
      setError(
        error.message || "No se pudo iniciar sesión. Inténtalo nuevamente."
      );
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">

        <div className="login-header">
          <div className="login-icon"></div>

          <h1>Iniciar sesión</h1>

          <p>
            Ingresa tus credenciales para acceder al sistema.
          </p>
        </div>

        <form onSubmit={manejarSubmit} className="login-form">

          <div className="login-form-group">
            <label htmlFor="correo">
              Correo electrónico
            </label>

            <input
              id="correo"
              type="email"
              placeholder="ejemplo@correo.com"
              value={correo}
              onChange={(e) => {
                setCorreo(e.target.value);
                setError("");
              }}
            />
          </div>

          <div className="login-form-group">
            <label htmlFor="contraseña">
              Contraseña
            </label>

            <div className="password-container">
              <input
                id="contraseña"
                type={mostrarContraseña ? "text" : "password"}
                placeholder="Ingresa tu contraseña"
                value={contraseña}
                onChange={(e) => {
                  setContraseña(e.target.value);
                  setError("");
                }}
              />

              <button
                type="button"
                className="btn-mostrar-password"
                onClick={() =>
                  setMostrarContraseña(!mostrarContraseña)
                }
              >
                {mostrarContraseña ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error">
              <p>{error}</p>
            </div>
          )}

          <button
            type="submit"
            className="btn-login"
            disabled={cargando}
          >
            {cargando ? "Ingresando..." : "Ingresar"}
          </button>

        </form>

        <div className="login-footer">
          <p>
            Acceso exclusivo para usuarios registrados.
          </p>
        </div>

      </div>
    </div>
  );
}

export default LoginPage;