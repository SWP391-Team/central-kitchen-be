import { Request, Response } from 'express';
import supplyOrderService from '../services/supplyOrderService';
import { SupplyOrderCreateDto } from '../models/SupplyOrder';

interface AuthRequest extends Request {
  user?: {
    user_id: number;
    username: string;
    role_id: number;
    store_id: number | null;
  };
}

export class SupplyOrderController {
  createSupplyOrder = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      if (user.role_id === 1) {
        res.status(403).json({
          success: false,
          message: 'Admin cannot create supply orders (read-only access)',
        });
        return;
      }

      if (!user.store_id) {
        res.status(403).json({
          success: false,
          message: 'User must be assigned to a store to create supply orders',
        });
        return;
      }

      const orderData: SupplyOrderCreateDto = req.body;

      if (!orderData.items || orderData.items.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Supply order must have at least one item',
        });
        return;
      }

      const supplyOrder = await supplyOrderService.createSupplyOrder(
        user.store_id,
        user.user_id,
        orderData
      );

      res.status(201).json({
        success: true,
        data: supplyOrder,
        message: 'Supply order created successfully',
      });
    } catch (error: any) {
      console.error('Create supply order error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create supply order',
      });
    }
  };

  getSupplyOrderById = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const orderId = parseInt(req.params.id as string);

      if (isNaN(orderId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid order ID',
        });
        return;
      }

      const order = await supplyOrderService.getSupplyOrderById(orderId);

      if (user.role_id === 3 && order.store_id !== user.store_id) {
        res.status(403).json({
          success: false,
          message: 'You can only view orders from your store',
        });
        return;
      }

      res.json({
        success: true,
        data: order,
      });
    } catch (error: any) {
      console.error('Get supply order error:', error);
      if (error.message === 'Supply order not found') {
        res.status(404).json({
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

  getAllSupplyOrders = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      let orders;
      if (user.role_id === 1) {
        orders = await supplyOrderService.getAllSupplyOrders();
      } else if (user.role_id === 3 && user.store_id) {
        orders = await supplyOrderService.getSupplyOrdersByStore(user.store_id);
      } else {
        res.status(403).json({
          success: false,
          message: 'Access denied or user not assigned to a store',
        });
        return;
      }

      res.json({
        success: true,
        data: orders,
      });
    } catch (error) {
      console.error('Get all supply orders error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  getAllSupplyOrdersCentral = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      if (user.role_id === 1 || user.role_id === 2) {
        const orders = await supplyOrderService.getAllSupplyOrders();
        res.json({
          success: true,
          data: orders,
        });
      } else {
        res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }
    } catch (error) {
      console.error('Get all supply orders central error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  getSupplyOrdersByStore = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const storeId = parseInt(req.params.storeId as string);

      if (isNaN(storeId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid store ID',
        });
        return;
      }

      if (user.role_id !== 1) {
        res.status(403).json({
          success: false,
          message: 'Only admin can view orders from specific stores',
        });
        return;
      }

      const orders = await supplyOrderService.getSupplyOrdersByStore(storeId);

      res.json({
        success: true,
        data: orders,
      });
    } catch (error) {
      console.error('Get supply orders by store error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  reviewSupplyOrder = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      if (user.role_id !== 2) {
        res.status(403).json({
          success: false,
          message: 'Only Central Staff can review supply orders',
        });
        return;
      }

      const orderId = parseInt(req.params.id as string);
      if (isNaN(orderId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid order ID',
        });
        return;
      }

      const { items } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Items array is required',
        });
        return;
      }

      const order = await supplyOrderService.reviewSupplyOrder(orderId, items);

      res.json({
        success: true,
        data: order,
        message: 'Supply order reviewed successfully',
      });
    } catch (error: any) {
      console.error('Review supply order error:', error);
      const statusCode = error.message.includes('not found') ? 404 :
                         error.message.includes('Only Central Staff') ? 403 :
                         error.message.includes('SUBMITTED') ? 400 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to review supply order',
      });
    }
  };

  startDelivery = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      if (user.role_id !== 2) {
        res.status(403).json({
          success: false,
          message: 'Only Central Staff can start delivery',
        });
        return;
      }

      const orderId = parseInt(req.params.id as string);
      if (isNaN(orderId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid order ID',
        });
        return;
      }

      const order = await supplyOrderService.startDelivery(orderId);

      res.json({
        success: true,
        data: order,
        message: 'Delivery started successfully',
      });
    } catch (error: any) {
      console.error('Start delivery error:', error);
      const statusCode = error.message.includes('not found') ? 404 :
                         error.message.includes('Only Central Staff') ? 403 :
                         error.message.includes('APPROVED') ? 400 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to start delivery',
      });
    }
  };

  confirmReceived = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      if (user.role_id !== 3) {
        res.status(403).json({
          success: false,
          message: 'Only Store Staff can confirm received',
        });
        return;
      }

      const orderId = parseInt(req.params.id as string);
      if (isNaN(orderId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid order ID',
        });
        return;
      }

      const { batches } = req.body;
      if (!batches || !Array.isArray(batches) || batches.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Batches array with receipted quantities is required',
        });
        return;
      }

      const order = await supplyOrderService.confirmReceived(orderId, batches);

      res.json({
        success: true,
        data: order,
        message: 'Order confirmed as received successfully',
      });
    } catch (error: any) {
      console.error('Confirm received error:', error);
      const statusCode = error.message.includes('not found') ? 404 :
                         error.message.includes('Only Store Staff') ? 403 :
                         error.message.includes('DELIVERING') ? 400 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to confirm received',
      });
    }
  };

  stockSupplyOrder = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      if (user.role_id !== 3) {
        res.status(403).json({
          success: false,
          message: 'Only Store Staff can stock orders',
        });
        return;
      }

      const orderId = parseInt(req.params.id as string);
      if (isNaN(orderId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid order ID',
        });
        return;
      }

      const { batches } = req.body;
      if (!batches || !Array.isArray(batches) || batches.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Batches array with stocked quantities is required',
        });
        return;
      }

      const order = await supplyOrderService.stockSupplyOrder(orderId, batches);

      res.json({
        success: true,
        data: order,
        message: 'Order stocked successfully',
      });
    } catch (error: any) {
      console.error('Stock order error:', error);
      const statusCode = error.message.includes('not found') ? 404 :
                         error.message.includes('Only Store Staff') ? 403 :
                         error.message.includes('RECEIPTED') ? 400 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to stock order',
      });
    }
  };

  cancelSupplyOrder = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      if (user.role_id !== 2 && user.role_id !== 3) {
        res.status(403).json({
          success: false,
          message: 'Only Central Staff or Store Staff can cancel orders',
        });
        return;
      }

      const orderId = parseInt(req.params.id as string);
      if (isNaN(orderId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid order ID',
        });
        return;
      }

      const order = await supplyOrderService.cancelSupplyOrder(orderId);

      res.json({
        success: true,
        data: order,
        message: 'Supply order cancelled successfully',
      });
    } catch (error: any) {
      console.error('Cancel order error:', error);
      const statusCode = error.message.includes('not found') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to cancel order',
      });
    }
  };
}

export default new SupplyOrderController();
