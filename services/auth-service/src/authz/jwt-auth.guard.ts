import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// 401 si falta el token, es inválido o está expirado 
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
