import { leerDatosAdmin } from './seed-admin.helpers';

describe('ABC-182: seed:admin sin secretos en código', () => {
  it('devuelve null si falta alguna variable', () => {
    expect(
      leerDatosAdmin({ ADMIN_EMAIL: 'a@x.com', ADMIN_PASSWORD: '12345678' }),
    ).toBeNull();
    expect(leerDatosAdmin({})).toBeNull();
  });

  it('normaliza el correo y exige mínimo de 8 caracteres', () => {
    expect(
      leerDatosAdmin({
        ADMIN_EMAIL: '  Admin@X.com ',
        ADMIN_PASSWORD: 'corta',
        ADMIN_NOMBRE: 'Admin',
      }),
    ).toBeNull();
    expect(
      leerDatosAdmin({
        ADMIN_EMAIL: '  Admin@X.com ',
        ADMIN_PASSWORD: 'ClaveSegura123!',
        ADMIN_NOMBRE: 'Admin',
      }),
    ).toEqual({
      correo: 'admin@x.com',
      nombre: 'Admin',
      password: 'ClaveSegura123!',
    });
  });
});
