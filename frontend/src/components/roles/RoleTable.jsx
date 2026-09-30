function RoleTable({ roles, onView, onEdit, onDesactivar }) {
  return (
    <div className="roles-table-container">
      <table className="roles-table">
        <thead>
          <tr>
            <th scope="col">Rol</th>
            <th scope="col">Descripción</th>
            <th scope="col">Permisos</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>

        <tbody>
          {roles.map((role) => (
            <tr key={role.id}>
              <td>
                <div className="role-name">
                  {role.name}
                </div>
              </td>

              <td>
                <span className="role-description">
                  {role.description}
                </span>
              </td>

              <td>
                <span className="permission-count">
                  {role.permissions.length}
                </span>
              </td>

              <td>
                <div className="role-actions ts-row-actions">
                  <button
                    className="action-button ts-btn ts-btn--sm"
                    onClick={() => onView(role)}
                    title="Ver permisos"
                    aria-label={`Ver permisos de ${role.name}`}
                  >
                    Ver
                  </button>

                  <button
                    className="action-button ts-btn ts-btn--sm"
                    onClick={() => onEdit(role)}
                    title="Editar permisos"
                    aria-label={`Editar permisos de ${role.name}`}
                  >
                    Editar
                  </button>

                  {role.activo !== false && (
                    <button
                      className="action-button ts-btn ts-btn--sm"
                      onClick={() => onDesactivar(role)}
                      title={`Desactivar ${role.name}`}
                      aria-label={`Desactivar ${role.name}`}
                    >
                      Desactivar
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default RoleTable;