import { Request, Response } from 'express';
import productionPlanService from '../services/productionPlanService';
import { ProductionPlanCreateDto } from '../models/ProductionPlan';

interface AuthRequest extends Request {
  user?: {
    user_id: number;
    username: string;
    role_id: number;
    location_id: number | null;
    location_ids: number[];
  };
}

export class ProductionPlanController {
  getProductionPlans = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        search,
        status,
        sortBy = 'created_at',
        sortOrder = 'desc',
        page = '1',
        limit = '10'
      } = req.query;

      const params = {
        search: search as string,
        status: status as string,
        sortBy: sortBy as 'planned_date' | 'created_at' | 'plan_code',
        sortOrder: sortOrder as 'asc' | 'desc',
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      };

      const result = await productionPlanService.getProductionPlans(params);

      res.json({
        success: true,
        data: result.plans,
        pagination: {
          total: result.total,
          page: params.page,
          limit: params.limit,
          totalPages: Math.ceil(result.total / params.limit)
        }
      });
    } catch (error) {
      console.error('Get production plans error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  getProductionPlanById = async (req: Request, res: Response): Promise<void> => {
    try {
      const planId = parseInt(req.params.id as string);

      if (isNaN(planId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid plan ID',
        });
        return;
      }

      const plan = await productionPlanService.getProductionPlanById(planId);

      res.json({
        success: true,
        data: plan,
      });
    } catch (error) {
      console.error('Get production plan by ID error:', error);
      if (error instanceof Error && error.message === 'Production plan not found') {
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

  createProductionPlan = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const planData: ProductionPlanCreateDto = req.body;

      const plan = await productionPlanService.createProductionPlan(planData, user.user_id);

      res.status(201).json({
        success: true,
        data: plan,
        message: 'Production plan created successfully',
      });
    } catch (error) {
      console.error('Create production plan error:', error);
      if (error instanceof Error) {
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

  cancelProductionPlan = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const planId = parseInt(req.params.id as string);

      if (isNaN(planId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid plan ID',
        });
        return;
      }

      const plan = await productionPlanService.cancelProductionPlan(planId);

      res.json({
        success: true,
        data: plan,
        message: 'Production plan cancelled successfully',
      });
    } catch (error) {
      console.error('Cancel production plan error:', error);
      if (error instanceof Error) {
        if (error.message === 'Production plan not found') {
          res.status(404).json({
            success: false,
            message: error.message,
          });
        } else if (error.message.includes('can be cancelled')) {
          res.status(400).json({
            success: false,
            message: error.message,
          });
        } else {
          res.status(400).json({
            success: false,
            message: error.message,
          });
        }
      } else {
        res.status(500).json({
          success: false,
          message: 'Internal server error',
        });
      }
    }
  };

  releasePlan = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const planId = parseInt(req.params.id as string);

      if (isNaN(planId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid plan ID',
        });
        return;
      }

      const plan = await productionPlanService.releasePlan(planId);

      res.json({
        success: true,
        data: plan,
        message: 'Production plan released successfully',
      });
    } catch (error) {
      console.error('Release production plan error:', error);
      if (error instanceof Error) {
        if (error.message === 'Production plan not found') {
          res.status(404).json({
            success: false,
            message: error.message,
          });
        } else if (error.message.includes('can be released')) {
          res.status(400).json({
            success: false,
            message: error.message,
          });
        } else {
          res.status(400).json({
            success: false,
            message: error.message,
          });
        }
      } else {
        res.status(500).json({
          success: false,
          message: 'Internal server error',
        });
      }
    }
  };

  closeProductionPlan = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const planId = parseInt(req.params.id as string);

      if (isNaN(planId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid plan ID',
        });
        return;
      }

      const plan = await productionPlanService.closeProductionPlan(planId);

      res.json({
        success: true,
        data: plan,
        message: 'Production plan closed successfully',
      });
    } catch (error) {
      console.error('Close production plan error:', error);
      if (error instanceof Error) {
        if (error.message === 'Production plan not found') {
          res.status(404).json({
            success: false,
            message: error.message,
          });
        } else if (error.message.includes('can be closed')) {
          res.status(400).json({
            success: false,
            message: error.message,
          });
        } else {
          res.status(400).json({
            success: false,
            message: error.message,
          });
        }
      } else {
        res.status(500).json({
          success: false,
          message: 'Internal server error',
        });
      }
    }
  };
}

const productionPlanController = new ProductionPlanController();
export default productionPlanController;
