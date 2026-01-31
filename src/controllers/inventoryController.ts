import { Request, Response } from 'express';
import inventoryService from '../services/inventoryService';

export class InventoryController {
  getInventoryByStore = async (req: Request, res: Response): Promise<void> => {
    try {
      const storeId = parseInt(req.params.storeId as string);
      
      if (isNaN(storeId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid store ID',
        });
        return;
      }

      const inventory = await inventoryService.getInventoryByStore(storeId);
      res.json({
        success: true,
        data: inventory,
      });
    } catch (error) {
      console.error('Get inventory by store error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };


  disposeInventory = async (req: Request, res: Response): Promise<void> => {
    try {
      const inventoryId = parseInt(req.params.inventoryId as string);
      const { disposed_reason } = req.body;
      
      if (isNaN(inventoryId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid inventory ID',
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

      await inventoryService.disposeInventory(inventoryId, disposed_reason);
      
      res.json({
        success: true,
        message: 'Inventory disposed successfully',
      });
    } catch (error: any) {
      console.error('Dispose inventory error:', error);
      if (error.message === 'Inventory not found') {
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
      await inventoryService.updateAllInventoryStatuses();
      
      res.json({
        success: true,
        message: 'Inventory statuses updated successfully',
      });
    } catch (error) {
      console.error('Update inventory statuses error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };
}

export default new InventoryController();
