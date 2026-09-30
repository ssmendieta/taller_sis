import React, { useEffect, useState } from "react";
import {
  actualizarUsuario,
  cambiarEstadoUsuario,
  crearUsuario,
  darDeBajaUsuario,
  listarRolesActivos,
  listarUsuarios,
} from "../services/usuarios";
import "../styles/UsuarioPage.css";

function prepararUsuario(usuario, roles) {
  const rolId = String(usuario.rol_id);
  return {
    id: String(usuario.id),
    nombre: usuario.nombre_completo,
    correo: usuario.correo,
    rol_id: rolId,
    rol: roles.find((rol) => String(rol.id) === rolId)?.nombre ?? "Rol inactivo o no disponible",
    estado: usuario.eliminado_en ? "Dado de baja" : usuario.activo ? "Activo" : "Inactivo",
  };
}

function UsuarioPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [intento, setIntento] = useState(0);
  const [guardando, setGuardando] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("Todos");

  const [mostrarModal, setMostrarModal] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState(null);

  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [accionPendiente, setAccionPendiente] = useState(null);

  const [mensaje, setMensaje] = useState("");
  const [mensajeError, setMensajeError] = useState(false);

  const [formulario, setFormulario] = useState({
    nombre: "",
    correo: "",
    contraseña: "",
    rol: "",
  });

  useEffect(() => {
    const controller = new AbortController();
    setCargando(true);
    setErrorCarga("");
    Promise.all([
      listarUsuarios(controller.signal, true),
      listarRolesActivos(controller.signal),
    ])
      .then(([datosUsuarios, datosRoles]) => {
        setRoles(datosRoles);
        setUsuarios(datosUsuarios.map((usuario) => prepararUsuario(usuario, datosRoles)));
      })
      .catch((error) => {
        if (error.name !== "AbortError") setErrorCarga(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargando(false);
      });
    return () => controller.abort();
  }, [intento]);

  const usuariosFiltrados = usuarios.filter((usuario) => {
    const coincideBusqueda =
      usuario.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      usuario.correo.toLowerCase().includes(busqueda.toLowerCase());

    const coincideEstado =
      filtroEstado === "Todos" || usuario.estado === filtroEstado;

    return coincideBusqueda && coincideEstado;
  });

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

  const abrirEditar = (usuario) => {
    setModoEdicion(true);
    setUsuarioSeleccionado(usuario);

    setFormulario({
      nombre: usuario.nombre,
      correo: usuario.correo,
      contraseña: "",
      rol: usuario.rol_id,
    });

    setMostrarModal(true);
  };

  const manejarCambio = (e) => {
    const { name, value } = e.target;

    setFormulario({
      ...formulario,
      [name]: value,
    });
  };

  const guardarUsuario = async (e) => {
    e.preventDefault();

    if (guardando) return;
    if (!formulario.nombre.trim() || !formulario.correo.trim() || !formulario.rol) {
      mostrarMensaje("Completa todos los campos obligatorios.", true);
      return;
    }
    if (!roles.some((rol) => String(rol.id) === formulario.rol)) {
      mostrarMensaje("Selecciona un rol activo.", true);
      return;
    }
    if (!modoEdicion && formulario.contraseña.length < 6) {
      mostrarMensaje("La contraseña inicial debe tener al menos 6 caracteres.", true);
      return;
    }

    const datos = {
      nombre_completo: formulario.nombre.trim(),
      correo: formulario.correo.trim(),
      rol_id: Number(formulario.rol),
      ...(!modoEdicion ? { password: formulario.contraseña } : {}),
    };

    setGuardando(true);
    try {
      const guardado = modoEdicion
        ? await actualizarUsuario(usuarioSeleccionado.id, datos)
        : await crearUsuario(datos);
      const usuario = prepararUsuario(guardado, roles);
      setUsuarios((actuales) => modoEdicion
        ? actuales.map((item) => item.id === usuario.id ? usuario : item)
        : [...actuales, usuario]);
      setMostrarModal(false);
      mostrarMensaje(modoEdicion ? "Usuario actualizado correctamente." : "Usuario creado correctamente.");
    } catch (error) {
      mostrarMensaje(error.message || "No se pudo guardar el usuario.", true);
    } finally {
      setGuardando(false);
    }
  };

  const prepararAccion = (usuario, accion) => {
    setUsuarioSeleccionado(usuario);
    setAccionPendiente(accion);
    setMostrarConfirmacion(true);
  };

  const ejecutarAccion = async () => {
    if (!usuarioSeleccionado || !accionPendiente || guardando) return;
    setGuardando(true);
    try {
      if (accionPendiente === "baja") {
        await darDeBajaUsuario(usuarioSeleccionado.id);
        setUsuarios((actuales) => actuales.map((item) => item.id === usuarioSeleccionado.id ? { ...item, estado: "Dado de baja" } : item));
      } else {
        const actualizado = await cambiarEstadoUsuario(usuarioSeleccionado.id, accionPendiente === "activar");
        const usuario = prepararUsuario(actualizado, roles);
        setUsuarios((actuales) => actuales.map((item) => item.id === usuario.id ? usuario : item));
      }
      setMostrarConfirmacion(false);
      setAccionPendiente(null);
      mostrarMensaje("Cambio guardado correctamente.");
    } catch (error) {
      mostrarMensaje(error.message || "No se pudo actualizar el usuario.", true);
    } finally {
      setGuardando(false);
    }
  };

  const mostrarMensaje = (texto, esError = false) => {
    setMensaje(texto);
    setMensajeError(esError);

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

      <div className="usuarios-header">
        <div>
          <h1>Usuarios</h1>
          <p>
            Gestiona las cuentas de usuario y sus permisos de acceso al sistema.
          </p>
        </div>

        <button className="btn-nuevo" onClick={abrirCrear} disabled={cargando || !!errorCarga || roles.length === 0}>
          + Nuevo usuario
        </button>
      </div>

      {cargando && <p role="status">Cargando usuarios y roles…</p>}
      {errorCarga && <div className="usuarios-error" role="alert">
        <p>No se pudieron cargar los usuarios o los roles: {errorCarga}</p>
        <button type="button" onClick={() => setIntento((actual) => actual + 1)}>Reintentar</button>
      </div>}
      {!cargando && !errorCarga && roles.length === 0 && <p role="alert">No hay roles activos disponibles para asignar.</p>}

      <div className="usuarios-filtros">

        <div className="buscador">
          <span>⌕</span>

          <input
            id="busqueda-usuarios"
            type="text"
            placeholder="Buscar por nombre o correo..."
            aria-label="Buscar por nombre o correo"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <div className="filtro">
          <label htmlFor="filtro-estado-usuarios">Estado:</label>

          <select
            id="filtro-estado-usuarios"
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

      <div className="tabla-container">
        <table className="usuarios-tabla">

          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Correo</th>
              <th scope="col">Rol</th>
              <th scope="col">Estado</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {!cargando && !errorCarga && usuariosFiltrados.length > 0 ? (
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

                      {usuario.estado === "Dado de baja" ? (
                        <span>—</span>
                      ) : (
                        <>
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

                          <button
                            className="btn-accion btn-baja"
                            onClick={() =>
                              prepararAccion(usuario, "baja")
                            }
                          >
                            Dar de baja
                          </button>
                        </>
                      )}

                    </div>
                  </td>

                </tr>
              ))
            ) : !cargando && !errorCarga ? (
              <tr>
                <td colSpan="5" className="sin-resultados">
                  No se encontraron usuarios.
                </td>
              </tr>
            ) : null}
          </tbody>

        </table>
      </div>

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

                  {modoEdicion && !roles.some((rol) => String(rol.id) === formulario.rol) && formulario.rol && (
                    <option value={formulario.rol} disabled>Rol actual inactivo: selecciona otro</option>
                  )}
                  {roles.map((rol) => (
                    <option key={rol.id} value={String(rol.id)}>
                      {rol.nombre}
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

                <button type="submit" className="btn-guardar" disabled={guardando}>
                  {modoEdicion
                    ? "Guardar cambios"
                    : "Crear usuario"}
                </button>

              </div>

            </form>

          </div>

        </div>
      )}

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
                disabled={guardando}
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

      {mensaje && (
        <div className={mensajeError ? "mensaje-exito mensaje-error" : "mensaje-exito"} role="alert">
          <span>{mensajeError ? "!" : "✓"}</span>
          {mensaje}
        </div>
      )}

    </div>
  );
}

export default UsuarioPage;
