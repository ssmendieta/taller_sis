function RoleTable({ roles, onView, onEdit }) {
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
                    aria-label={`Consultar permisos de ${role.name}`}
                  >
                    👁️
                  </button>

                  <button
                    className="action-button"
                    onClick={() => onEdit(role)}
                    title="Modificar permisos"
                    aria-label={`Modificar permisos de ${role.name}`}
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