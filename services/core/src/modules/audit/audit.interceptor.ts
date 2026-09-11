import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, user, body, ip, headers } = req;
    const userAgent = headers['user-agent'];

    return next.handle().pipe(
      tap((data) => {
        if (method !== 'GET') {
          // Ghi nhận cơ bản cho các request thay đổi trạng thái
          this.auditService.log(
            'API',
            url,
            method,
            undefined,
            { body, response: data },
            user?.userId,
            undefined,
            ip,
            userAgent
          ).catch(console.error);
        }
      }),
    );
  }
}
