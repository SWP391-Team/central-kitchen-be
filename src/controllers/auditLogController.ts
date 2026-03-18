import { Request, Response } from 'express';
import auditLogService from '../services/auditLogService';

export class AuditLogController {
  getAuditLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      const search = req.query.search ? String(req.query.search) : undefined;
      const action = req.query.action ? String(req.query.action) : undefined;
      const userId = req.query.userId ? Number(req.query.userId) : undefined;
      const fromDate = req.query.fromDate ? String(req.query.fromDate) : undefined;
      const toDate = req.query.toDate ? String(req.query.toDate) : undefined;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;

      const result = await auditLogService.getAll({
        search,
        action: action as any,
        userId: Number.isFinite(userId) ? userId : undefined,
        fromDate,
        toDate,
        page: Number.isFinite(page) ? page : 1,
        limit: Number.isFinite(limit) ? limit : 20,
      });

      res.json({
        success: true,
        data: result.data,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    } catch (error: any) {
      console.error('Get audit logs error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get audit logs',
      });
    }
  };

  getAuditStats = async (_req: Request, res: Response): Promise<void> => {
    try {
      const stats = await auditLogService.getStats();
      res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      console.error('Get audit stats error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get audit stats',
      });
    }
  };
}

export default new AuditLogController();
