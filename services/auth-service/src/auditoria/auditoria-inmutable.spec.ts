import * as fs from 'node:fs';
import * as path from 'node:path';

describe('ABC-186: auditoría inmutable', () => {
  it('versiona un trigger que impide UPDATE y DELETE', () => {
    const ruta = path.resolve(
      __dirname,
      '../database/migrations/1710000000006-AuditoriaInmutable.ts',
    );
    const sql = fs.readFileSync(ruta, 'utf8');
    expect(sql).toMatch(/impedir_cambios_auditoria/);
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON auditoria/);
    expect(sql).toMatch(/RAISE EXCEPTION/);
  });
});
