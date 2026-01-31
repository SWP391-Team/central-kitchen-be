import { Request, Response } from 'express';
import productBatchService from '../services/productBatchService';
import { ProductBatchCreateDto } from '../models/ProductBatch';

export class ProductBatchController {
  getAllBatches = async (req: Request, res: Response): Promise<void> => {
    try {
      const batches = await productBatchService.getAllBatchesWithDetails();
      res.json({
        success: true,
        data: batches,
      });
    } catch (error) {
      console.error('Get all batches error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  getBatchesByStore = async (req: Request, res: Response): Promise<void> => {
    try {
      const storeId = parseInt(req.params.storeId as string);
      
      if (isNaN(storeId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid store ID',
        });
        return;
      }

      const batches = await productBatchService.getBatchesByStore(storeId);
      res.json({
        success: true,
        data: batches,
      });
    } catch (error) {
      console.error('Get batches by store error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  createBatches = async (req: Request, res: Response): Promise<void> => {
    try {
      const batchesData: ProductBatchCreateDto[] = req.body.batches;
      
      if (!Array.isArray(batchesData) || batchesData.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Batches array is required and must not be empty',
        });
        return;
      }

      const createdBatches = await productBatchService.createBatches(batchesData);
      
      res.status(201).json({
        success: true,
        message: `${createdBatches.length} batch(es) created successfully`,
        data: createdBatches,
      });
    } catch (error: any) {
      console.error('Create batches error:', error);
      if (error.message.includes('must') || error.message.includes('required')) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Internal server error',
        });
      }
    }
  };

  disposeBatch = async (req: Request, res: Response): Promise<void> => {
    try {
      const batchId = parseInt(req.params.id as string);
      const { disposed_reason } = req.body;
      
      if (isNaN(batchId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid batch ID',
        });
        return;
      }

      if (!disposed_reason) {
        res.status(400).json({
          success: false,
          message: 'Disposed reason is required',
        });
        return;
      }

      await productBatchService.disposeBatch(batchId, disposed_reason);
      
      res.json({
        success: true,
        message: 'Batch disposed successfully',
      });
    } catch (error: any) {
      console.error('Dispose batch error:', error);
      if (error.message === 'Batch not found') {
        res.status(404).json({
          success: false,
          message: error.message,
        });
      } else if (error.message.includes('already disposed') || error.message.includes('Invalid')) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Internal server error',
        });
      }
    }
  };

  updateStatuses = async (req: Request, res: Response): Promise<void> => {
    try {
      await productBatchService.updateBatchStatuses();
      
      res.json({
        success: true,
        message: 'Batch statuses updated successfully',
      });
    } catch (error) {
      console.error('Update statuses error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };
}

export default new ProductBatchController();
