import { Request, Response } from 'express';
import supplyOrderService from '../services/supplyOrderService';

interface AuthRequest extends Request {
  user?: {
    user_id: number;
    username: string;
    role_id: number;
    location_id: number | null;
    location_ids: number[];
  };
}

export class SupplyOrderController {
  getCkInventory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = await supplyOrderService.getCkInventory();
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  searchRequesters = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const keyword = typeof req.query.q === 'string' ? req.query.q : undefined;
      const data = await supplyOrderService.searchRequesters(req.user, keyword);
      res.json({ success: true, data });
    } catch (error: any) {
      const status = error.message?.includes('Unauthorized') ? 401 : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  };

  getList = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const location_id = req.query.location_id ? parseInt(req.query.location_id as string, 10) : undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      const result = await supplyOrderService.listSupplyOrders(req.user, {
        search,
        status,
        location_id,
        page,
        limit,
      });

      res.json({
        success: true,
        data: result.rows,
        pagination: {
          total: result.total,
          page: page || 1,
          limit: limit || 20,
        },
      });
    } catch (error: any) {
      const status = error.message?.includes('Unauthorized') ? 401 : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  };

  getDetail = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const orderId = parseInt(req.params.id as string, 10);
      if (isNaN(orderId)) {
        res.status(400).json({ success: false, message: 'Invalid supply order ID' });
        return;
      }

      const result = await supplyOrderService.getSupplyOrderDetail(req.user, orderId);
      res.json({ success: true, data: result });
    } catch (error: any) {
      const message = error.message || 'Failed to get supply order detail';
      const status =
        message.includes('not found')
          ? 404
          : message.includes('Unauthorized')
          ? 401
          : message.includes('permission')
          ? 403
          : 400;
      res.status(status).json({ success: false, message });
    }
  };

  create = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const result = await supplyOrderService.createSupplyOrder(req.user, req.body);
      res.status(201).json({
        success: true,
        data: result,
        message: 'Supply order created successfully',
      });
    } catch (error: any) {
      const message = error.message || 'Failed to create supply order';
      const status =
        message.includes('Unauthorized')
          ? 401
          : message.includes('Only Store Staff')
          ? 403
          : 400;
      res.status(status).json({ success: false, message });
    }
  };

  sendToCk = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const orderId = parseInt(req.params.id as string, 10);
      if (isNaN(orderId)) {
        res.status(400).json({ success: false, message: 'Invalid supply order ID' });
        return;
      }

      const result = await supplyOrderService.sendToCk(req.user, orderId);
      res.json({ success: true, data: result, message: 'Supply order sent to CK successfully' });
    } catch (error: any) {
      const message = error.message || 'Failed to send supply order to CK';
      const status =
        message.includes('not found')
          ? 404
          : message.includes('permission')
          ? 403
          : message.includes('Unauthorized')
          ? 401
          : 400;
      res.status(status).json({ success: false, message });
    }
  };

  approve = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const orderId = parseInt(req.params.id as string, 10);
      if (isNaN(orderId)) {
        res.status(400).json({ success: false, message: 'Invalid supply order ID' });
        return;
      }

      const result = await supplyOrderService.approveSupplyOrder(req.user, orderId, req.body);
      res.json({ success: true, data: result, message: 'Supply order approved successfully' });
    } catch (error: any) {
      const message = error.message || 'Failed to approve supply order';
      const status =
        message.includes('not found')
          ? 404
          : message.includes('Only Admin or Central Staff')
          ? 403
          : message.includes('Unauthorized')
          ? 401
          : 400;
      res.status(status).json({ success: false, message });
    }
  };

  deliverItem = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const orderId = parseInt(req.params.id as string, 10);
      const itemId = parseInt(req.params.itemId as string, 10);
      if (isNaN(orderId) || isNaN(itemId)) {
        res.status(400).json({ success: false, message: 'Invalid supply order or item ID' });
        return;
      }

      const result = await supplyOrderService.createDeliveryTransfer(
        req.user,
        orderId,
        itemId,
        req.body
      );

      res.status(201).json({
        success: true,
        data: result,
        message: 'Delivery transfer created successfully',
      });
    } catch (error: any) {
      const message = error.message || 'Failed to create delivery transfer';
      const status =
        message.includes('not found')
          ? 404
          : message.includes('Only Admin or Central Staff')
          ? 403
          : message.includes('Unauthorized')
          ? 401
          : 400;
      res.status(status).json({ success: false, message });
    }
  };

  closeOrder = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const orderId = parseInt(req.params.id as string, 10);
      if (isNaN(orderId)) {
        res.status(400).json({ success: false, message: 'Invalid supply order ID' });
        return;
      }

      const result = await supplyOrderService.closeSupplyOrder(req.user, orderId, req.body);
      res.json({ success: true, data: result, message: 'Supply order closed successfully' });
    } catch (error: any) {
      const message = error.message || 'Failed to close supply order';
      const status =
        message.includes('not found')
          ? 404
          : message.includes('permission')
          ? 403
          : message.includes('Unauthorized')
          ? 401
          : 400;
      res.status(status).json({ success: false, message });
    }
  };
}

export default new SupplyOrderController();
