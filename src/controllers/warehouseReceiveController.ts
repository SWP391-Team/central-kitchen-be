import { Request, Response } from 'express';
import warehouseReceiveService from '../services/warehouseReceiveService';

interface AuthRequest extends Request {
  user?: any;
}

export class WarehouseReceiveController {
  getAll = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = await warehouseReceiveService.getAllWarehouseReceives();
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
      const data =
        await warehouseReceiveService.getReceivesByTransferId(transferId);
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

      const { batch_transfer_id, received_qty, received_date } = req.body;

      if (
        batch_transfer_id === undefined ||
        received_qty === undefined ||
        !received_date
      ) {
        res.status(400).json({
          success: false,
          message:
            'batch_transfer_id, received_qty, and received_date are required',
        });
        return;
      }

      const result = await warehouseReceiveService.createWarehouseReceive({
        batch_transfer_id,
        received_qty,
        received_date,
        received_by: user.user_id,
        created_by: user.user_id,
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
}

export default new WarehouseReceiveController();
