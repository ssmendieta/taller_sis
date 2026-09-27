import { useState } from "react";
import { Search } from "lucide-react";
import RoleTable from "../components/roles/RoleTable";
import RoleModal from "../components/roles/RoleModal";
import PermissionsModal from "../components/roles/PermissionsModal";
import "../styles/RolesPage.css";
const initialRoles = [
  {
    id: 1,
    name: "Administrador",
    description:
      "Gestiona usuarios, roles, permisos y todas las funcionalidades del sistema.",
    permissions: [
      "usuarios.ver",
      "usuarios.crear",
      "usuarios.editar",
      "usuarios.eliminar",
      "roles.ver",
      "roles.crear",
      "roles.editar",
      "produccion.ver",
      "produccion.crear",
      "produccion.editar",
      "produccion.eliminar",
      "recetas.ver",
      "recetas.crear",
      "recetas.editar",
      "recetas.eliminar",
      "inventario.ver",
      "inventario.crear",
      "inventario.editar",
      "reportes.ver",
    ],
  },
  {
    id: 2,
    name: "Encargado de Producción",
    description:
      "Gestiona las actividades relacionadas con la producción.",
    permissions: [
      "produccion.ver",
      "produccion.crear",
      "produccion.editar",
      "recetas.ver",
      "recetas.crear",
      "recetas.editar",
      "inventario.ver",
      "reportes.ver",
    ],
  },
  {
    id: 3,
    name: "Encargado de Logística",
    description:
      "Rol destinado a la gestión de las funcionalidades logísticas.",
    permissions: [
      "inventario.ver",
      "reportes.ver",
    ],
  },
  {
    id: 4,
    name: "Supervisor",
    description:
      "Supervisa y consulta la información del sistema.",
    permissions: [
      "produccion.ver",
      "recetas.ver",
      "inventario.ver",
      "reportes.ver",
    ],
  },
];

function RolesPage() {
  const [roles, setRoles] = useState(initialRoles);
  const [search, setSearch] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);

  const [selectedRole, setSelectedRole] = useState(null);
  const [permissionMode, setPermissionMode] = useState(null);

  const filteredRoles = roles.filter((role) =>
    role.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateRole = (newRole) => {
    const role = {
      ...newRole,
      id: Date.now(),
    };

    setRoles((currentRoles) => [
      ...currentRoles,
      role,
    ]);

    setShowCreateModal(false);
  };

  const handleViewPermissions = (role) => {
    setSelectedRole(role);
    setPermissionMode("view");
  };

  const handleEditPermissions = (role) => {
    setSelectedRole(role);
    setPermissionMode("edit");
  };

  const handleSavePermissions = (updatedRole) => {
    setRoles((currentRoles) =>
      currentRoles.map((role) =>
        role.id === updatedRole.id
          ? updatedRole
          : role
      )
    );

    setSelectedRole(null);
    setPermissionMode(null);
  };

  const closePermissionsModal = () => {
    setSelectedRole(null);
    setPermissionMode(null);
  };

  return (
    <div className="roles-container">

      <div className="roles-header">
        <div>
          <h1 className="roles-title">
            Roles y permisos
          </h1>

          <p className="roles-subtitle">
            Administra los perfiles y permisos de acceso
            al sistema.
          </p>
        </div>

        <button
          className="primary-button"
          onClick={() => setShowCreateModal(true)}
        >
          + Crear rol
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
              placeholder="Buscar rol..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
            />
          </div>
        </div>

        <RoleTable
          roles={filteredRoles}
          onView={handleViewPermissions}
          onEdit={handleEditPermissions}
        />

        {filteredRoles.length === 0 && (
          <div className="empty-state">
            No se encontraron roles.
          </div>
        )}
      </div>

      {showCreateModal && (
        <RoleModal
          onClose={() =>
            setShowCreateModal(false)
          }
          onCreate={handleCreateRole}
        />
      )}

      {selectedRole && (
        <PermissionsModal
          role={selectedRole}
          mode={permissionMode}
          onClose={closePermissionsModal}
          onSave={handleSavePermissions}
        />
      )}

    </div>
  );
}

export default RolesPage;