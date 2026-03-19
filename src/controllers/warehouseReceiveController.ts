import { Request, Response } from 'express';
import warehouseReceiveService from '../services/warehouseReceiveService';

interface AuthRequest extends Request {
  user?: any;
}

export class WarehouseReceiveController {
  getAll = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      const locationIds: number[] | undefined =
        user?.role_id === 3 ? user.location_ids : undefined;

      const data = await warehouseReceiveService.getAllWarehouseReceives(
        locationIds
      );
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getByTransferId = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const transferId = parseInt(req.params.transferId as string);
      if (isNaN(transferId)) {
        res
          .status(400)
          .json({ success: false, message: 'Invalid transfer ID' });
        return;
      }
      const user = req.user;
      const locationIds: number[] | undefined =
        user?.role_id === 3 ? user.location_ids : undefined;

      const data =
        await warehouseReceiveService.getReceivesByTransferId(
          transferId,
          locationIds
        );
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getById = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const receiveId = parseInt(req.params.id as string, 10);
      if (isNaN(receiveId)) {
        res.status(400).json({ success: false, message: 'Invalid receive ID' });
        return;
      }

      const user = req.user;
      const locationIds: number[] | undefined =
        user?.role_id === 3 ? user.location_ids : undefined;

      const data = await warehouseReceiveService.getWarehouseReceiveById(
        receiveId,
        locationIds
      );

      if (!data) {
        res.status(404).json({ success: false, message: 'Warehouse receive not found' });
        return;
      }

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

      const { batch_transfer_id, received_qty, received_date, received_by } = req.body;

      if (
        batch_transfer_id === undefined ||
        received_qty === undefined ||
        !received_date ||
        received_by === undefined
      ) {
        res.status(400).json({
          success: false,
          message:
            'batch_transfer_id, received_qty, received_date, and received_by are required',
        });
        return;
      }

      const result = await warehouseReceiveService.createWarehouseReceive({
        batch_transfer_id,
        received_qty,
        received_date,
        received_by: parseInt(received_by),
        created_by: user.user_id,
        user_role_id: user.role_id,
        user_location_ids: user.location_ids,
        requester_user_id: user.user_id,
      });

      res.status(201).json({
        success: true,
        data: result,
        message: 'Warehouse receive created successfully',
      });
    } catch (error: any) {
      const status = error.message?.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  };

  searchReceivedBySuggestions = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const batchTransferId = parseInt(req.query.batch_transfer_id as string);
      if (isNaN(batchTransferId)) {
        res.status(400).json({ success: false, message: 'batch_transfer_id is required' });
        return;
      }

      const keyword = typeof req.query.q === 'string' ? req.query.q : undefined;
      const data = await warehouseReceiveService.searchReceivedBySuggestions({
        batch_transfer_id: batchTransferId,
        requester_user_id: user.user_id,
        requester_role_id: user.role_id,
        requester_location_ids: user.location_ids,
        keyword,
      });

      res.json({ success: true, data });
    } catch (error: any) {
      const status = error.message?.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  };
}

export default new WarehouseReceiveController();
