import React, { useState } from "react";
import "../styles/UsuarioPage.css";

const usuariosIniciales = [
  {
    id: 1,
    nombre: "Juan Pérez",
    correo: "juan.perez@gmail.com",
    rol: "Encargado de Producción",
    estado: "Activo",
  },
  {
    id: 2,
    nombre: "María López",
    correo: "maria.lopez@gmail.com",
    rol: "Encargado de Logística",
    estado: "Activo",
  },
  {
    id: 3,
    nombre: "Carlos Ruiz",
    correo: "carlos.ruiz@gmail.com",
    rol: "Supervisor",
    estado: "Inactivo",
  },
];

const roles = [
  "Administrador",
  "Encargado de Producción",
  "Encargado de Logística",
  "Supervisor",
];

function UsuarioPage() {
  const [usuarios, setUsuarios] = useState(usuariosIniciales);

  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("Todos");

  const [mostrarModal, setMostrarModal] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState(null);

  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [accionPendiente, setAccionPendiente] = useState(null);

  const [mensaje, setMensaje] = useState("");

  const [formulario, setFormulario] = useState({
    nombre: "",
    correo: "",
    contraseña: "",
    rol: "",
  });

  // Filtrar usuarios
  const usuariosFiltrados = usuarios.filter((usuario) => {
    const coincideBusqueda =
      usuario.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      usuario.correo.toLowerCase().includes(busqueda.toLowerCase());

    const coincideEstado =
      filtroEstado === "Todos" || usuario.estado === filtroEstado;

    return coincideBusqueda && coincideEstado;
  });

  // Abrir modal para crear
  const abrirCrear = () => {
    setModoEdicion(false);
    setUsuarioSeleccionado(null);

    setFormulario({
      nombre: "",
      correo: "",
      contraseña: "",
      rol: "",
    });

    setMostrarModal(true);
  };

  // Abrir modal para editar
  const abrirEditar = (usuario) => {
    setModoEdicion(true);
    setUsuarioSeleccionado(usuario);

    setFormulario({
      nombre: usuario.nombre,
      correo: usuario.correo,
      contraseña: "",
      rol: usuario.rol,
    });

    setMostrarModal(true);
  };

  // Cambiar valores del formulario
  const manejarCambio = (e) => {
    const { name, value } = e.target;

    setFormulario({
      ...formulario,
      [name]: value,
    });
  };

  // Guardar usuario
  const guardarUsuario = (e) => {
    e.preventDefault();

    // Validación básica
    if (!formulario.nombre || !formulario.correo || !formulario.rol) {
      mostrarMensaje("Completa todos los campos obligatorios.");
      return;
    }

    // Comprobar correo duplicado
    const correoExiste = usuarios.some(
      (usuario) =>
        usuario.correo.toLowerCase() === formulario.correo.toLowerCase() &&
        (!modoEdicion || usuario.id !== usuarioSeleccionado.id)
    );

    if (correoExiste) {
      mostrarMensaje("Ya existe un usuario con este correo.");
      return;
    }

    if (modoEdicion) {
      setUsuarios(
        usuarios.map((usuario) =>
          usuario.id === usuarioSeleccionado.id
            ? {
                ...usuario,
                nombre: formulario.nombre,
                correo: formulario.correo,
                rol: formulario.rol,
              }
            : usuario
        )
      );

      mostrarMensaje("Usuario actualizado correctamente.");
    } else {
      if (!formulario.contraseña) {
        mostrarMensaje("Ingresa una contraseña inicial.");
        return;
      }

      const nuevoUsuario = {
        id: Date.now(),
        nombre: formulario.nombre,
        correo: formulario.correo,
        rol: formulario.rol,
        estado: "Activo",
      };

      setUsuarios([...usuarios, nuevoUsuario]);

      mostrarMensaje("Usuario creado correctamente.");
    }

    setMostrarModal(false);
  };

  // Preparar activar/desactivar/baja
  const prepararAccion = (usuario, accion) => {
    setUsuarioSeleccionado(usuario);
    setAccionPendiente(accion);
    setMostrarConfirmacion(true);
  };

  // Ejecutar acción
  const ejecutarAccion = () => {
    if (!usuarioSeleccionado || !accionPendiente) return;

    let nuevoEstado = usuarioSeleccionado.estado;
    let mensajeAccion = "";

    if (accionPendiente === "activar") {
      nuevoEstado = "Activo";
      mensajeAccion = "Usuario activado correctamente.";
    }

    if (accionPendiente === "desactivar") {
      nuevoEstado = "Inactivo";
      mensajeAccion = "Usuario desactivado correctamente.";
    }

    if (accionPendiente === "baja") {
      nuevoEstado = "Dado de baja";
      mensajeAccion = "Usuario dado de baja correctamente.";
    }

    setUsuarios(
      usuarios.map((usuario) =>
        usuario.id === usuarioSeleccionado.id
          ? { ...usuario, estado: nuevoEstado }
          : usuario
      )
    );

    setMostrarConfirmacion(false);
    setAccionPendiente(null);

    mostrarMensaje(mensajeAccion);
  };

  // Mensajes temporales
  const mostrarMensaje = (texto) => {
    setMensaje(texto);

    setTimeout(() => {
      setMensaje("");
    }, 3000);
  };

  const obtenerClaseEstado = (estado) => {
    if (estado === "Activo") return "estado activo";
    if (estado === "Inactivo") return "estado inactivo";
    return "estado baja";
  };

  const obtenerIconoEstado = (estado) => {
    if (estado === "Activo") return "●";
    if (estado === "Inactivo") return "●";
    return "●";
  };

  return (
    <div className="usuarios-container">

      {/* ENCABEZADO */}
      <div className="usuarios-header">
        <div>
          <h1>Usuarios</h1>
          <p>
            Gestiona las cuentas de usuario y sus permisos de acceso al sistema.
          </p>
        </div>

        <button className="btn-nuevo" onClick={abrirCrear}>
          + Nuevo usuario
        </button>
      </div>

      {/* FILTROS */}
      <div className="usuarios-filtros">

        <div className="buscador">
          <span>⌕</span>

          <input
            type="text"
            placeholder="Buscar por nombre o correo..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <div className="filtro">
          <label>Estado:</label>

          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
          >
            <option value="Todos">Todos</option>
            <option value="Activo">Activos</option>
            <option value="Inactivo">Inactivos</option>
            <option value="Dado de baja">Dados de baja</option>
          </select>
        </div>

      </div>

      {/* TABLA */}
      <div className="tabla-container">
        <table className="usuarios-tabla">

          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {usuariosFiltrados.length > 0 ? (
              usuariosFiltrados.map((usuario) => (
                <tr key={usuario.id}>

                  <td>
                    <div className="usuario-nombre">
                      <div className="avatar">
                        {usuario.nombre.charAt(0).toUpperCase()}
                      </div>

                      <span>{usuario.nombre}</span>
                    </div>
                  </td>

                  <td>{usuario.correo}</td>

                  <td>
                    <span className="rol-badge">
                      {usuario.rol}
                    </span>
                  </td>

                  <td>
                    <span className={obtenerClaseEstado(usuario.estado)}>
                      {obtenerIconoEstado(usuario.estado)}
                      {usuario.estado}
                    </span>
                  </td>

                  <td>
                    <div className="acciones">

                      <button
                        className="btn-editar"
                        onClick={() => abrirEditar(usuario)}
                      >
                        Editar
                      </button>

                      {usuario.estado === "Activo" && (
                        <button
                          className="btn-accion btn-desactivar"
                          onClick={() =>
                            prepararAccion(usuario, "desactivar")
                          }
                        >
                          Desactivar
                        </button>
                      )}

                      {usuario.estado === "Inactivo" && (
                        <button
                          className="btn-accion btn-activar"
                          onClick={() =>
                            prepararAccion(usuario, "activar")
                          }
                        >
                          Activar
                        </button>
                      )}

                      {usuario.estado !== "Dado de baja" && (
                        <button
                          className="btn-accion btn-baja"
                          onClick={() =>
                            prepararAccion(usuario, "baja")
                          }
                        >
                          Dar de baja
                        </button>
                      )}

                    </div>
                  </td>

                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="sin-resultados">
                  No se encontraron usuarios.
                </td>
              </tr>
            )}
          </tbody>

        </table>
      </div>

      {/* MODAL CREAR / EDITAR */}
      {mostrarModal && (
        <div className="modal-overlay">

          <div className="modal">

            <div className="modal-header">
              <div>
                <h2>
                  {modoEdicion
                    ? "Editar usuario"
                    : "Crear nuevo usuario"}
                </h2>

                <p>
                  {modoEdicion
                    ? "Modifica la información del usuario."
                    : "Registra una nueva cuenta de usuario."}
                </p>
              </div>

              <button
                className="btn-cerrar"
                onClick={() => setMostrarModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={guardarUsuario}>

              <div className="form-group">
                <label>
                  Nombre completo <span>*</span>
                </label>

                <input
                  type="text"
                  name="nombre"
                  placeholder="Ej. Juan Pérez"
                  value={formulario.nombre}
                  onChange={manejarCambio}
                />
              </div>

              <div className="form-group">
                <label>
                  Correo electrónico <span>*</span>
                </label>

                <input
                  type="email"
                  name="correo"
                  placeholder="Ej. juan@gmail.com"
                  value={formulario.correo}
                  onChange={manejarCambio}
                />
              </div>

              {!modoEdicion && (
                <div className="form-group">
                  <label>
                    Contraseña inicial <span>*</span>
                  </label>

                  <input
                    type="password"
                    name="contraseña"
                    placeholder="Contraseña inicial"
                    value={formulario.contraseña}
                    onChange={manejarCambio}
                  />
                </div>
              )}

              <div className="form-group">
                <label>
                  Rol <span>*</span>
                </label>

                <select
                  name="rol"
                  value={formulario.rol}
                  onChange={manejarCambio}
                >
                  <option value="">Seleccionar rol</option>

                  {roles.map((rol) => (
                    <option key={rol} value={rol}>
                      {rol}
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-footer">

                <button
                  type="button"
                  className="btn-cancelar"
                  onClick={() => setMostrarModal(false)}
                >
                  Cancelar
                </button>

                <button type="submit" className="btn-guardar">
                  {modoEdicion
                    ? "Guardar cambios"
                    : "Crear usuario"}
                </button>

              </div>

            </form>

          </div>

        </div>
      )}

      {/* MODAL CONFIRMACIÓN */}
      {mostrarConfirmacion && usuarioSeleccionado && (
        <div className="modal-overlay">

          <div className="modal modal-confirmacion">

            <div className="confirmacion-icono">
              !
            </div>

            <h2>
              {accionPendiente === "activar" && "Activar usuario"}
              {accionPendiente === "desactivar" && "Desactivar usuario"}
              {accionPendiente === "baja" && "Dar de baja usuario"}
            </h2>

            <p>
              {accionPendiente === "activar" &&
                `¿Deseas activar la cuenta de ${usuarioSeleccionado.nombre}? El usuario podrá iniciar sesión nuevamente.`}

              {accionPendiente === "desactivar" &&
                `¿Deseas desactivar la cuenta de ${usuarioSeleccionado.nombre}? El usuario no podrá iniciar sesión.`}

              {accionPendiente === "baja" &&
                `¿Deseas dar de baja a ${usuarioSeleccionado.nombre}? Esta acción realizará una baja lógica del usuario.`}
            </p>

            <div className="modal-footer">

              <button
                className="btn-cancelar"
                onClick={() => setMostrarConfirmacion(false)}
              >
                Cancelar
              </button>

              <button
                className={
                  accionPendiente === "activar"
                    ? "btn-guardar"
                    : "btn-confirmar-danger"
                }
                onClick={ejecutarAccion}
              >
                {accionPendiente === "activar"
                  ? "Activar"
                  : accionPendiente === "desactivar"
                  ? "Desactivar"
                  : "Dar de baja"}
              </button>

            </div>

          </div>

        </div>
      )}

      {/* MENSAJE */}
      {mensaje && (
        <div className="mensaje-exito">
          <span>✓</span>
          {mensaje}
        </div>
      )}

    </div>
  );
}

export default UsuarioPage;