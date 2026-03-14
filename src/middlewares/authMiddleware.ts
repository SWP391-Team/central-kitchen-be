import { Request, Response, NextFunction } from 'express';

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

export const requireLocation = (...allowedLocations: number[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    const userLocationIds = req.user.location_ids || [];
    const hasAccess = allowedLocations.some((locationId) => userLocationIds.includes(locationId));

    if (!hasAccess) {
      res.status(403).json({
        success: false,
        message: 'Access denied. You do not have access to this location.',
      });
      return;
    }

    next();
  };
};

export const requireStore = requireLocation;
