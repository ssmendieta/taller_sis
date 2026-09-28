import { SetMetadata } from '@nestjs/common';

export const REQUIERE_PERMISO_KEY = 'requiere_permiso';


export const RequierePermiso = (codigo: string) =>
  SetMetadata(REQUIERE_PERMISO_KEY, codigo);
