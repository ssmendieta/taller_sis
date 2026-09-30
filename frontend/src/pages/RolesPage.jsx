import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import RoleTable from "../components/roles/RoleTable";
import RoleModal from "../components/roles/RoleModal";
import PermissionsModal from "../components/roles/PermissionsModal";
import Paginacion, { paginar, totalPaginas } from "../components/ui/Paginacion.jsx";
import {
  actualizarRol,
  crearRol,
  listarPermisos,
  listarRoles,
  reemplazarPermisosRol,
} from "../services/roles.js";
import "../styles/RolesPage.css";
import { FORMATO_TITULO } from "../constants/marca.js";

function adaptarRol(rol) {
  return {
    id: rol.id,
    name: rol.nombre,
    description: rol.descripcion ?? "—",
    permissions: (rol.permisos ?? []).map((p) => p.codigo),
    activo: rol.activo,
    _raw: rol,
  };
}

function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [search, setSearch] = useState("");
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [errorFormulario, setErrorFormulario] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [permissionMode, setPermissionMode] = useState(null);

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      const [rolesBackend, permisosBackend] = await Promise.all([
        listarRoles(),
        listarPermisos(),
      ]);
      setRoles((Array.isArray(rolesBackend) ? rolesBackend : []).map(adaptarRol));
      setCatalogo(Array.isArray(permisosBackend) ? permisosBackend : []);
      setPagina(1);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { document.title = FORMATO_TITULO("Roles y permisos"); }, []);

  useEffect(() => {
    cargar();
  }, []);

  const filteredRoles = roles.filter((role) =>
    role.name.toLowerCase().includes(search.toLowerCase()),
  );
  const paginasRoles = totalPaginas(filteredRoles);
  const rolesVisibles = paginar(filteredRoles, pagina);

  const handleCreateRole = async (nuevo) => {
    setErrorFormulario("");
    try {
      const creado = await crearRol({
        nombre: nuevo.name,
        descripcion: nuevo.description,
      });
      setRoles((actual) => [...actual, adaptarRol(creado)]);
      setShowCreateModal(false);
    } catch (e) {
      setErrorFormulario(e.message);
    }
  };

  const handleViewPermissions = (role) => {
    setSelectedRole(role);
    setPermissionMode("view");
  };

  const handleEditPermissions = (role) => {
    setSelectedRole(role);
    setPermissionMode("edit");
  };

  const handleSavePermissions = async (actualizado) => {
    setErrorFormulario("");
    try {
      const porCodigo = new Map(catalogo.map((p) => [p.codigo, p.id]));
      const ids = (actualizado.permissions ?? [])
        .map((codigo) => Number(porCodigo.get(codigo)))
        .filter((n) => Number.isInteger(n) && n > 0);
      const guardado = await reemplazarPermisosRol(actualizado.id, ids);
      setRoles((actual) =>
        actual.map((role) =>
          String(role.id) === String(actualizado.id)
            ? adaptarRol(guardado)
            : role,
        ),
      );
      setSelectedRole(null);
      setPermissionMode(null);
    } catch (e) {
      setErrorFormulario(e.message);
    }
  };

  const closePermissionsModal = () => {
    setSelectedRole(null);
    setPermissionMode(null);
  };

  async function desactivarRol(role) {
    if (!window.confirm(`Desactivar el rol ${role.name}? Sus usuarios perderán esos permisos.`)) return;
    setError("");
    try {
      const guardado = await actualizarRol(role.id, { activo: false });
      setRoles((actual) =>
        actual.map((r) =>
          String(r.id) === String(role.id) ? adaptarRol(guardado) : r,
        ),
      );
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="roles-container">
      <div className="roles-header">
        <div>
          <h1 className="roles-title">Roles y permisos</h1>
        </div>
        <button
          className="primary-button"
          onClick={() => {
            setErrorFormulario("");
            setShowCreateModal(true);
          }}
        >
          Crear rol
        </button>
      </div>

      <div className="roles-card">
        <div className="roles-toolbar">
          <div className="search-container">
            <span className="search-icon">
              <Search size={18} />
            </span>
            <input
              type="text"
              placeholder="Buscar rol"
              aria-label="Buscar rol"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPagina(1); }}
            />
          </div>
        </div>

        {cargando && <p role="status">Cargando roles…</p>}
        {error && (
          <p role="alert" className="empty-state">
            No se pudieron cargar los roles: {error} <button type="button" className="cancel-button" onClick={cargar}>Reintentar</button>
          </p>
        )}

        {!cargando && !error && (
          <>
            <RoleTable
              roles={rolesVisibles}
              onView={handleViewPermissions}
              onEdit={handleEditPermissions}
              onDesactivar={desactivarRol}
            />
            {filteredRoles.length === 0 && (
              <div className="empty-state">Sin resultados.</div>
            )}
            <Paginacion pagina={pagina} total={paginasRoles} alCambiar={setPagina} etiqueta="Paginación de roles" />
          </>
        )}
      </div>

      {showCreateModal && (
        <RoleModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateRole}
        />
      )}
      {errorFormulario && <p role="alert">{errorFormulario}</p>}

      {selectedRole && (
        <PermissionsModal
          role={selectedRole}
          mode={permissionMode}
          catalogo={catalogo}
          onClose={closePermissionsModal}
          onSave={handleSavePermissions}
        />
      )}
    </div>
  );
}

export default RolesPage;
