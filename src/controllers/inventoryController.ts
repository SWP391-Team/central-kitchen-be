import { Request, Response } from 'express';
import inventoryService from '../services/inventoryService';

interface AuthRequest extends Request {
  user?: any;
}

export class InventoryController {
  getBatchInventory = async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const user = req.user;
      const locationIds: number[] | undefined =
        user?.role_id === 1 ? undefined : user?.location_ids;

      const data = await inventoryService.getBatchInventory(locationIds);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getInventoryTransactions = async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const user = req.user;
      const locationIds: number[] | undefined =
        user?.role_id === 1 ? undefined : user?.location_ids;

      const data = await inventoryService.getInventoryTransactions(locationIds);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
}

export default new InventoryController();
