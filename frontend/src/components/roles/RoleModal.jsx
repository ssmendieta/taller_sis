import { useState } from "react";
import { X } from "lucide-react";
function RoleModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!name.trim()) {
      alert("Ingresa el nombre del rol.");
      return;
    }

    onCreate({
      name: name.trim(),
      description: description.trim() || "—",
      permissions: [],
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2>Crear rol</h2>
          </div>

          <button
            className="modal-close"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nombre del rol</label>

            <input
              type="text"
              placeholder="Ej. Encargado de Almacén"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Descripción</label>

            <textarea
              rows="4"
              placeholder="Describe las responsabilidades de este rol..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="modal-buttons">
            <button
              type="button"
              className="cancel-button"
              onClick={onClose}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="primary-button"
            >
              Crear rol
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RoleModal;