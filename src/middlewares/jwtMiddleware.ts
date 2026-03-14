import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';

declare global {
  namespace Express {
    interface Request {
      user?: {
        user_id: number;
        username: string;
        role_id: number;
        location_id: number | null;
        location_ids: number[];
      };
    }
  }
}

const authService = new AuthService();

export const jwtMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    const token = authHeader.substring(7); 
    const decoded = authService.verifyToken(token);
    const decodedLocationIds = Array.isArray(decoded.location_ids)
      ? decoded.location_ids.filter((id: unknown) => typeof id === 'number')
      : decoded.location_id !== null && decoded.location_id !== undefined
        ? [decoded.location_id]
        : [];

    req.user = {
      user_id: decoded.user_id,
      username: decoded.username,
      role_id: decoded.role_id,
      location_id: decodedLocationIds[0] ?? null,
      location_ids: decodedLocationIds,
    };

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};
