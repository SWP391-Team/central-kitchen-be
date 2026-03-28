import { Request, Response } from 'express';
import reserveService from '../services/reserveService';

interface AuthRequest extends Request {
  user?: {
    user_id: number;
    username: string;
    role_id: number;
    location_id: number | null;
    location_ids: number[];
  };
}

export class ReserveController {
  getReserveProducts = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const productId = req.query.product_id ? Number(req.query.product_id) : undefined;
      const supplyOrderItemId = req.query.supply_order_item_id
        ? Number(req.query.supply_order_item_id)
        : undefined;
      const supplyOrderCode = typeof req.query.supply_order_code === 'string'
        ? req.query.supply_order_code
        : undefined;

      const data = await reserveService.listProductReserves(req.user, {
        status,
        product_id: productId,
        supply_order_code: supplyOrderCode,
        supply_order_item_id: supplyOrderItemId,
      });

      res.json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  };

  getReserveBatches = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const productId = req.query.product_id ? Number(req.query.product_id) : undefined;
      const supplyOrderItemId = req.query.supply_order_item_id
        ? Number(req.query.supply_order_item_id)
        : undefined;
      const supplyOrderCode = typeof req.query.supply_order_code === 'string'
        ? req.query.supply_order_code
        : undefined;

      const data = await reserveService.listBatchReserves(req.user, {
        status,
        product_id: productId,
        supply_order_code: supplyOrderCode,
        supply_order_item_id: supplyOrderItemId,
      });

      res.json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  };

  getReserveHistory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const reserveId = req.query.reserve_id ? Number(req.query.reserve_id) : undefined;
      const supplyOrderId = req.query.supply_order_id ? Number(req.query.supply_order_id) : undefined;

      const data = await reserveService.listReserveHistory(req.user, {
        reserve_id: reserveId,
        supply_order_id: supplyOrderId,
      });

      res.json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  };

  allocateReserveBatch = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const reserveId = Number(req.params.reserveId);
      if (!Number.isInteger(reserveId) || reserveId <= 0) {
        res.status(400).json({ success: false, message: 'Invalid reserve ID' });
        return;
      }

      const allocations = Array.isArray(req.body?.allocations) ? req.body.allocations : null;
      if (!allocations) {
        res.status(400).json({ success: false, message: 'allocations is required' });
        return;
      }

      const result = await reserveService.allocateReserveBatches(req.user, reserveId, allocations);
      res.json({
        success: true,
        message: 'Reserve batch allocation created successfully',
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  };
}

export default new ReserveController();
