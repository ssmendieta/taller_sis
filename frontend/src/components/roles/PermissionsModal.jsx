import { useState } from "react";

const permissionGroups = [
  {
    module: "Usuarios",
    permissions: [
      {
        id: "usuarios.ver",
        label: "Ver usuarios",
      },
      {
        id: "usuarios.crear",
        label: "Crear usuarios",
      },
      {
        id: "usuarios.editar",
        label: "Editar usuarios",
      },
      {
        id: "usuarios.eliminar",
        label: "Eliminar usuarios",
      },
    ],
  },

  {
    module: "Roles y permisos",
    permissions: [
      {
        id: "roles.ver",
        label: "Consultar roles",
      },
      {
        id: "roles.crear",
        label: "Crear roles",
      },
      {
        id: "roles.editar",
        label: "Modificar permisos",
      },
    ],
  },

  {
    module: "Producción",
    permissions: [
      {
        id: "produccion.ver",
        label: "Ver producción",
      },
      {
        id: "produccion.crear",
        label: "Registrar producción",
      },
      {
        id: "produccion.editar",
        label: "Modificar producción",
      },
      {
        id: "produccion.eliminar",
        label: "Eliminar producción",
      },
    ],
  },

  {
    module: "Recetas",
    permissions: [
      {
        id: "recetas.ver",
        label: "Ver recetas",
      },
      {
        id: "recetas.crear",
        label: "Crear recetas",
      },
      {
        id: "recetas.editar",
        label: "Modificar recetas",
      },
      {
        id: "recetas.eliminar",
        label: "Eliminar recetas",
      },
    ],
  },

  {
    module: "Inventario",
    permissions: [
      {
        id: "inventario.ver",
        label: "Consultar inventario",
      },
      {
        id: "inventario.crear",
        label: "Registrar inventario",
      },
      {
        id: "inventario.editar",
        label: "Modificar inventario",
      },
    ],
  },

  {
    module: "Reportes",
    permissions: [
      {
        id: "reportes.ver",
        label: "Consultar reportes",
      },
    ],
  },
];

function PermissionsModal({
  role,
  mode,
  onClose,
  onSave,
}) {
  const [selectedPermissions, setSelectedPermissions] =
    useState(role.permissions);

  const isViewMode = mode === "view";

  const togglePermission = (permissionId) => {
    if (isViewMode) return;

    setSelectedPermissions((current) => {
      if (current.includes(permissionId)) {
        return current.filter(
          (id) => id !== permissionId
        );
      }

      return [
        ...current,
        permissionId,
      ];
    });
  };

  const handleSave = () => {
    onSave({
      ...role,
      permissions: selectedPermissions,
    });
  };

  return (
    <div className="modal-overlay">

      <div className="permissions-modal">

        <div className="modal-header">

          <div>
            <h2>
              {isViewMode
                ? "Consultar permisos"
                : "Modificar permisos"}
            </h2>

            <p>
              Rol: <strong>{role.name}</strong>
            </p>
          </div>

          <button
            className="modal-close"
            onClick={onClose}
          >
            ×
          </button>

        </div>

        <div className="permissions-content">

          {permissionGroups.map((group) => (

            <div
              className="permission-group"
              key={group.module}
            >

              <h3>
                {group.module}
              </h3>

              <div className="permission-list">

                {group.permissions.map(
                  (permission) => (

                    <label
                      className="permission-item"
                      key={permission.id}
                    >

                      <input
                        type="checkbox"
                        checked={selectedPermissions.includes(
                          permission.id
                        )}
                        disabled={isViewMode}
                        onChange={() =>
                          togglePermission(
                            permission.id
                          )
                        }
                      />

                      <span>
                        {permission.label}
                      </span>

                    </label>

                  )
                )}

              </div>

            </div>

          ))}

        </div>

        <div className="modal-buttons">

          <button
            className="cancel-button"
            onClick={onClose}
          >
            {isViewMode
              ? "Cerrar"
              : "Cancelar"}
          </button>

          {!isViewMode && (
            <button
              className="primary-button"
              onClick={handleSave}
            >
              Guardar cambios
            </button>
          )}

        </div>

      </div>

    </div>
  );
}

export default PermissionsModal;