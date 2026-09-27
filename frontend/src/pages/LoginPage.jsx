import React, { useState } from "react";
import "../styles/LoginPage.css";

function LoginPage() {
  const [correo, setCorreo] = useState("");
  const [contraseña, setContraseña] = useState("");
  const [error, setError] = useState("");
  const [mostrarContraseña, setMostrarContraseña] = useState(false);
  const [cargando, setCargando] = useState(false);

  const manejarSubmit = (e) => {
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

    // Simulación temporal del inicio de sesión
    setTimeout(() => {
      setCargando(false);

      // Credenciales de prueba
      if (
        correo === "admin@gmail.com" &&
        contraseña === "123456"
      ) {
        alert("Inicio de sesión exitoso.");
      } else {
        setError(
          "Correo o contraseña incorrectos. Verifica tus datos e inténtalo nuevamente."
        );
      }
    }, 800);
  };

  return (
    <div className="login-page">

      <div className="login-card">

        {/* ENCABEZADO */}
        <div className="login-header">

          <div className="login-icon"></div>

          <h1>Iniciar sesión</h1>

          <p>
            Ingresa tus credenciales para acceder al sistema.
          </p>

        </div>

        {/* FORMULARIO */}
        <form onSubmit={manejarSubmit} className="login-form">

          {/* CORREO */}
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

          {/* CONTRASEÑA */}
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

          {/* MENSAJE DE ERROR */}
          {error && (
            <div className="login-error">
              <p>{error}</p>
            </div>
          )}

          {/* BOTÓN INGRESAR */}
          <button
            type="submit"
            className="btn-login"
            disabled={cargando}
          >
            {cargando ? "Ingresando..." : "Ingresar"}
          </button>

        </form>

        {/* PIE */}
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