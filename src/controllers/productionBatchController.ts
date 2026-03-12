import { Request, Response } from 'express';
import productionBatchService from '../services/productionBatchService';

interface AuthRequest extends Request {
  user?: any;
}

export class ProductionBatchController {
  createBatch = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const { plan_id, product_id } = req.body;

      if (!plan_id || !product_id) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields',
        });
        return;
      }

      const result = await productionBatchService.createBatch({
        plan_id,
        product_id,
        created_by: user.user_id,
      });

      res.status(201).json({
        success: true,
        data: result,
        message: 'Batch created successfully',
      });
    } catch (error: any) {
      console.error('Create batch error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create batch',
      });
    }
  };

  finishProduction = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const batchId = parseInt(req.params.id as string);
      if (isNaN(batchId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid batch ID',
        });
        return;
      }

      const { produced_qty, production_date, expired_date } = req.body;

      if (!produced_qty || !production_date || !expired_date) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields',
        });
        return;
      }

      const result = await productionBatchService.finishProduction(batchId, {
        produced_qty,
        production_date,
        expired_date,
      });

      res.json({
        success: true,
        data: result,
        message: 'Production finished successfully',
      });
    } catch (error: any) {
      console.error('Finish production error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to finish production',
      });
    }
  };

  produceBatch = async (req: AuthRequest, res: Response): Promise<void> => {
    return this.createBatch(req, res);
  };

  getBatchesByPlanId = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const planId = parseInt(req.params.planId as string);
      if (isNaN(planId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid plan ID',
        });
        return;
      }

      const batches = await productionBatchService.getBatchesByPlanId(planId);

      res.json({
        success: true,
        data: batches,
      });
    } catch (error: any) {
      console.error('Get batches error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to get batches',
      });
    }
  };

  getBatchById = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const batchId = parseInt(req.params.id as string);
      if (isNaN(batchId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid batch ID',
        });
        return;
      }

      const batch = await productionBatchService.getBatchById(batchId);

      res.json({
        success: true,
        data: batch,
      });
    } catch (error: any) {
      console.error('Get batch error:', error);
      const statusCode = error.message.includes('not found') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to get batch',
      });
    }
  };

  cancelBatch = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const batchId = parseInt(req.params.id as string);
      if (isNaN(batchId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid batch ID',
        });
        return;
      }

      const result = await productionBatchService.cancelBatch(batchId);

      res.json({
        success: true,
        data: result,
        message: 'Batch cancelled successfully',
      });
    } catch (error: any) {
      console.error('Cancel batch error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to cancel batch',
      });
    }
  };

  sendToQC = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const batchId = parseInt(req.params.id as string);
      if (isNaN(batchId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid batch ID',
        });
        return;
      }

      const result = await productionBatchService.sendToQC(batchId);

      res.json({
        success: true,
        data: result,
        message: 'Batch sent to QC successfully',
      });
    } catch (error: any) {
      console.error('Send to QC error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to send batch to QC',
      });
    }
  };

  undoSendToQC = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const batchId = parseInt(req.params.id as string);
      if (isNaN(batchId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid batch ID',
        });
        return;
      }

      const result = await productionBatchService.undoSendToQC(batchId);

      res.json({
        success: true,
        data: result,
        message: 'Undo send to QC successfully. Batch status reverted to Produced.',
      });
    } catch (error: any) {
      console.error('Undo send to QC error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to undo send to QC',
      });
    }
  };

  getAllBatches = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const batches = await productionBatchService.getAllBatches();

      res.json({
        success: true,
        data: batches,
      });
    } catch (error: any) {
      console.error('Get all batches error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to get batches',
      });
    }
  };
}

export default new ProductionBatchController();
