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

      const { plan_id, product_id, produced_by } = req.body;

      if (!plan_id || !product_id || !produced_by) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields',
        });
        return;
      }

      const result = await productionBatchService.createBatch({
        plan_id,
        product_id,
        produced_by,
        created_by: user.user_id,
      }, user);

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
        changed_by: user.user_id,
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

  getNextBatchCode = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const code = await productionBatchService.getNextBatchCodePreview();
      res.json({
        success: true,
        data: { batch_code: code },
      });
    } catch (error: any) {
      console.error('Get next batch code error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to get next batch code',
      });
    }
  };

  searchProducedBySuggestions = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const keyword = typeof req.query.q === 'string' ? req.query.q : undefined;
      const data = await productionBatchService.searchProducedBySuggestions(req.user, keyword);
      res.json({ success: true, data });
    } catch (error: any) {
      const status = error.message?.includes('Unauthorized') ? 401 : 400;
      res.status(status).json({ success: false, message: error.message });
    }
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

      const result = await productionBatchService.cancelBatch(batchId, user.user_id);

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

      const result = await productionBatchService.sendToQC(batchId, user.user_id);

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

      const result = await productionBatchService.undoSendToQC(batchId, user.user_id);

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

  getBatchStatusHistory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const batchId = parseInt(req.params.id as string, 10);
      if (isNaN(batchId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid batch ID',
        });
        return;
      }

      const history = await productionBatchService.getBatchStatusHistory(batchId);

      res.json({
        success: true,
        data: history,
      });
    } catch (error: any) {
      console.error('Get batch status history error:', error);
      const statusCode = error.message.includes('not found') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to get batch status history',
      });
    }
  };
}

export default new ProductionBatchController();
