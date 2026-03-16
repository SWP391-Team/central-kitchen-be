import { Request, Response } from 'express';
import batchTransferService from '../services/batchTransferService';

interface AuthRequest extends Request {
  user?: any;
}

export class BatchTransferController {
  getAll = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = await batchTransferService.getAllBatchTransfers();
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getDelivering = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = await batchTransferService.getDeliveringBatchTransfers();
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
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'Invalid transfer ID' });
        return;
      }
      await batchTransferService.completeReceive(id);
      res.json({ success: true, message: 'Batch transfer marked as Received' });
    } catch (error: any) {
      const status = error.message?.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  };
}

export default new BatchTransferController();
