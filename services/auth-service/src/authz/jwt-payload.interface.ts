
export interface JwtPayload {
  sub: number | string;
  correo: string;
  rolId?: number | string;
  jti?: string;
}
