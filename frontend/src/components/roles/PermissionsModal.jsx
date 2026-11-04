import { useState } from "react";

function agruparPorModulo(catalogo) {
  const grupos = new Map();
  for (const permiso of catalogo) {
    const modulo = String(permiso.codigo ?? "").split(".")[0] || "otros";
    if (!grupos.has(modulo)) grupos.set(modulo, []);
    grupos.get(modulo).push(permiso);
  }
  return [...grupos.entries()].map(([modulo, permisos]) => ({
    modulo,
    permisos: permisos.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo))),
  }));
}

function PermissionsModal({ role, mode, catalogo, onClose, onSave }) {
  const [selectedPermissions, setSelectedPermissions] = useState(
    role.permissions ?? [],
  );

  const isViewMode = mode === "view";
  const grupos = agruparPorModulo(catalogo ?? []);

  const togglePermission = (codigo) => {
    if (isViewMode) return;
    setSelectedPermissions((current) =>
      current.includes(codigo)
        ? current.filter((id) => id !== codigo)
        : [...current, codigo],
    );
  };

  const handleSave = () => {
    onSave({ ...role, permissions: selectedPermissions });
  };

  return (
    <div className="modal-overlay">
      <div className="permissions-modal">
        <div className="modal-header">
          <div>
            <h2>{isViewMode ? "Ver permisos" : "Editar permisos"}</h2>
            <p>
              {role.name}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="permissions-content">
          {grupos.map((group) => (
            <div className="permission-group" key={group.modulo}>
              <h3>{group.modulo}</h3>
              <div className="permission-list">
                {group.permisos.map((permission) => (
                  <label className="permission-item" key={permission.codigo}>
                    <input
                      type="checkbox"
                      checked={selectedPermissions.includes(permission.codigo)}
                      disabled={isViewMode}
                      onChange={() => togglePermission(permission.codigo)}
                    />
                    <span>
                      {permission.nombre} ({permission.codigo})
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-buttons">
          <button className="cancel-button" onClick={onClose}>
            Cancelar
          </button>
          {!isViewMode && (
            <button className="primary-button" onClick={handleSave}>
              Guardar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PermissionsModal;
