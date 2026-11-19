import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyToken, TokenPayload } from './jwt';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ADMIN_ONLY_KEY = 'adminOnly';
export const AdminOnly = () => SetMetadata(ADMIN_ONLY_KEY, true);

export interface AuthedRequest extends Request {
  auth?: TokenPayload;
  user?: TokenPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = (req.headers as unknown as Record<string, string | undefined>)['authorization'];
    if (header?.startsWith('Bearer ')) {
      const payload = verifyToken(header.slice(7).trim());
      if (payload) {
        req.auth = payload;
        req.user = payload;
        if (payload.kind === 'admin') {
          if (!adminOnly) {
            throw new ForbiddenException({ code: 'USER_TOKEN_REQUIRED', message: '사용자 인증이 필요합니다.' });
          }
          return true;
        }
        if (adminOnly) {
          throw new ForbiddenException({ code: 'ADMIN_TOKEN_REQUIRED', message: '관리자 인증이 필요합니다.' });
        }
        return true;
      }
    }
    if (isPublic) return true;
    throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' });
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth || req.auth.kind !== 'admin') {
      throw new UnauthorizedException({ code: 'ADMIN_UNAUTHORIZED', message: '관리자 로그인이 필요합니다.' });
    }
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return req.auth;
});

export const CurrentAdmin = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return req.auth;
});
