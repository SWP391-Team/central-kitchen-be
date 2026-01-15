import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to check if user has required role(s)
 * Must be used after jwtMiddleware
 */
export const requireRole = (...allowedRoles: number[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role_id)) {
      res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.',
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to check if user belongs to a specific store
 * Must be used after jwtMiddleware
 */
export const requireStore = (storeId: number) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    if (req.user.store_id !== storeId) {
      res.status(403).json({
        success: false,
        message: 'Access denied. You do not have access to this store.',
      });
      return;
    }

    next();
  };
};
