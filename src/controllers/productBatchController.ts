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

      const createdBatches = await productBatchService.createBatchPlans(batchesData);
      
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
}

export default new ProductBatchController();
