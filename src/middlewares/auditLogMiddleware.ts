import { NextFunction, Request, Response } from 'express';
import auditLogService from '../services/auditLogService';

const EXCLUDED_PATHS = ['/api/health'];

const shouldSkip = (req: Request): boolean => {
  if (EXCLUDED_PATHS.some((path) => req.path.startsWith(path))) {
    return true;
  }

  if (req.path.startsWith('/api/audit-logs') && req.method.toUpperCase() === 'GET') {
    return true;
  }

  const method = req.method.toUpperCase();
  return !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
};

export const auditLogMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (shouldSkip(req)) {
    next();
    return;
  }

  const startedAt = Date.now();

  res.on('finish', () => {
    const action = auditLogService.detectAction(req.method, req.path);
    const { entityType, entityId } = auditLogService.detectEntity(req.path);

    const safeBody = req.body && typeof req.body === 'object' ? req.body : null;
    const safeQuery = req.query && typeof req.query === 'object' ? req.query : null;
    const method = req.method.toUpperCase();
    const newValues = ['POST', 'PUT', 'PATCH'].includes(method) ? safeBody : null;

    void auditLogService.log({
      user_id: req.user?.user_id ?? null,
      username: req.user?.username ?? null,
      role_id: req.user?.role_id ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      description: (res.locals?.auditDescription as string | undefined) || `${req.method.toUpperCase()} ${req.path}`,
      old_values: null,
      new_values: newValues,
      metadata: {
        query: safeQuery,
        body: safeBody,
        responseTimeMs: Date.now() - startedAt,
      },
      ip_address: req.ip || req.socket?.remoteAddress || null,
      user_agent: req.get('user-agent') || null,
      request_method: req.method.toUpperCase(),
      request_path: req.path,
      status_code: res.statusCode,
    });
  });

  next();
};
