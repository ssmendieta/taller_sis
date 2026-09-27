function RoleTable({ roles, onView, onEdit }) {
  return (
    <div className="roles-table-container">
      <table className="roles-table">
        <thead>
          <tr>
            <th>Rol</th>
            <th>Descripción</th>
            <th>Permisos</th>
            <th>Acciones</th>
          </tr>
        </thead>

        <tbody>
          {roles.map((role) => (
            <tr key={role.id}>
              <td>
                <div className="role-name">
                  <span className="role-icon">👤</span>
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
                <div className="role-actions">
                  <button
                    className="action-button"
                    onClick={() => onView(role)}
                    title="Consultar permisos"
                  >
                    👁️
                  </button>

                  <button
                    className="action-button"
                    onClick={() => onEdit(role)}
                    title="Modificar permisos"
                  >
                    ✏️
                  </button>
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