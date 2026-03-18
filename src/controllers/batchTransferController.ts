import { Request, Response } from 'express';
import pool from '../config/database';
import batchTransferService from '../services/batchTransferService';

interface AuthRequest extends Request {
  user?: any;
}

export class BatchTransferController {
  private toId(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return 0;
    }
    return parsed;
  }

  private normalizeLocationIds(rawIds: unknown[]): number[] {
    const ids = rawIds
      .map((id) => {
        if (typeof id === 'number') return id;
        if (typeof id === 'string' && id.trim() !== '') {
          const parsed = Number(id);
          return Number.isFinite(parsed) ? parsed : NaN;
        }
        return NaN;
      })
      .filter((id) => Number.isInteger(id) && id > 0) as number[];

    return Array.from(new Set(ids));
  }

  private async resolveUserLocationScope(user: any): Promise<number[]> {
    const tokenScope = this.normalizeLocationIds(user?.location_ids || []);
    if (tokenScope.length > 0) {
      return tokenScope;
    }

    const fallback = this.normalizeLocationIds([user?.location_id]);
    if (fallback.length > 0) {
      return fallback;
    }

    if (!user?.user_id) {
      return [];
    }

    const result = await pool.query(
      `SELECT
         u.location_id,
         COALESCE(
           ARRAY_AGG(ul.location_id) FILTER (WHERE ul.location_id IS NOT NULL),
           ARRAY[]::int[]
         ) AS location_ids
       FROM "user" u
       LEFT JOIN user_location ul ON ul.user_id = u.user_id
       WHERE u.user_id = $1
       GROUP BY u.user_id, u.location_id`,
      [user.user_id]
    );

    if (result.rows.length === 0) {
      return [];
    }

    const row = result.rows[0];
    const locationIds = Array.isArray(row.location_ids)
      ? this.normalizeLocationIds(row.location_ids)
      : [];

    if (locationIds.length > 0) {
      return locationIds;
    }

    return this.normalizeLocationIds([row.location_id]);
  }

  getAll = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      const locationIds: number[] | undefined =
        user?.role_id === 3 ? await this.resolveUserLocationScope(user) : undefined;

      const data = await batchTransferService.getAllBatchTransfers(locationIds);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getDelivering = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      const locationIds: number[] | undefined =
        user?.role_id === 3 ? await this.resolveUserLocationScope(user) : undefined;

      const data = await batchTransferService.getDeliveringBatchTransfers(
        locationIds
      );
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getByBatchId = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const batchId = parseInt(req.params.batchId as string);
      if (isNaN(batchId)) {
        res.status(400).json({ success: false, message: 'Invalid batch ID' });
        return;
      }
      const data = await batchTransferService.getBatchTransfersByBatchId(batchId);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  create = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const { batch_id, transfer_qty, transfer_date } = req.body;

      if (!batch_id || !transfer_qty || !transfer_date) {
        res.status(400).json({
          success: false,
          message: 'batch_id, transfer_qty, and transfer_date are required',
        });
        return;
      }

      const result = await batchTransferService.createBatchTransfer({
        batch_id,
        transfer_qty,
        transfer_date,
        created_by: user.user_id,
      });

      res.status(201).json({
        success: true,
        data: result,
        message: 'Batch transfer created successfully',
      });
    } catch (error: any) {
      const status = error.message?.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  };

  completeReceive = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid transfer ID' });
        return;
      }

      if (user?.role_id === 3) {
        const transfer = await batchTransferService.getBatchTransferById(id);
        if (!transfer) {
          res.status(404).json({ success: false, message: 'Batch transfer not found' });
          return;
        }

        const userLocations = await this.resolveUserLocationScope(user);
        const toLocationId = this.toId(transfer.to_location_id);
        if (!userLocations.includes(toLocationId)) {
          res.status(403).json({
            success: false,
            message: 'You do not have permission to complete receive for this transfer',
          });
          return;
        }
      }

      await batchTransferService.completeReceive(id, user?.user_id);
      res.json({ success: true, message: 'Batch transfer marked as Received' });
    } catch (error: any) {
      const status = error.message?.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  };
}

export default new BatchTransferController();
