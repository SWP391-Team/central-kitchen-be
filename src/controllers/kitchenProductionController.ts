import { Request, Response } from 'express';
import productBatchService from '../services/productBatchService';

export const getAllBatchPlans = async (req: Request, res: Response) => {
  try {
    const batches = await productBatchService.getAllBatchPlans();
    res.json({
      success: true,
      data: batches,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to fetch batch plans',
    });
  }
};

export const createBatchPlans = async (req: Request, res: Response) => {
  try {
    const batchesData = req.body;

    if (!Array.isArray(batchesData) || batchesData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Request body must be a non-empty array of batch plans',
      });
    }

    const createdBatches = await productBatchService.createBatchPlans(batchesData);

    res.status(201).json({
      success: true,
      data: createdBatches,
      message: `Successfully created ${createdBatches.length} batch plan(s)`,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create batch plans',
    });
  }
};

export const produceBatch = async (req: Request, res: Response) => {
  try {
    const batchId = parseInt(req.params.batchId as string);
    const { produced_quantity, production_date, expired_date } = req.body;

    if (!produced_quantity || !production_date || !expired_date) {
      return res.status(400).json({
        success: false,
        message: 'produced_quantity, production_date, and expired_date are required',
      });
    }

    const updatedBatch = await productBatchService.produceBatch(
      batchId,
      produced_quantity,
      new Date(production_date),
      new Date(expired_date)
    );

    res.json({
      success: true,
      data: updatedBatch,
      message: 'Batch produced successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to produce batch',
    });
  }
};

export const stockBatch = async (req: Request, res: Response) => {
  try {
    const batchId = parseInt(req.params.batchId as string);
    const { stocked_quantity } = req.body;

    if (!stocked_quantity) {
      return res.status(400).json({
        success: false,
        message: 'stocked_quantity is required',
      });
    }

    const updatedBatch = await productBatchService.stockBatch(batchId, stocked_quantity);

    res.json({
      success: true,
      data: updatedBatch,
      message: 'Batch stocked successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to stock batch',
    });
  }
};

export const cancelBatch = async (req: Request, res: Response) => {
  try {
    const batchId = parseInt(req.params.batchId as string);

    const updatedBatch = await productBatchService.cancelBatch(batchId);

    res.json({
      success: true,
      data: updatedBatch,
      message: 'Batch cancelled successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to cancel batch',
    });
  }
};
