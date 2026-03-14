import { Request, Response } from 'express';
import { StoreService } from '../services/storeService';
import { StoreCreateDto, StoreUpdateDto } from '../models/Store';

export class StoreController {
  private storeService: StoreService;

  constructor() {
    this.storeService = new StoreService();
  }

  getAllStores = async (req: Request, res: Response): Promise<void> => {
    try {
      const { search, is_active, location_type } = req.query;
      
      const params: any = {};
      if (search) params.search = search as string;
      if (is_active !== undefined) params.is_active = is_active === 'true';
      if (location_type) params.location_type = location_type as string;

      const stores = await this.storeService.getAllStores(params);
      res.json({
        success: true,
        data: stores,
      });
    } catch (error) {
      console.error('Get all stores error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  getStoreById = async (req: Request, res: Response): Promise<void> => {
    try {
      const storeId = parseInt(req.params.id as string);
      
      if (isNaN(storeId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid location ID',
        });
        return;
      }

      const store = await this.storeService.getStoreById(storeId);
      
      res.json({
        success: true,
        data: store,
      });
    } catch (error: any) {
      console.error('Get store by ID error:', error);
      if (error.message === 'Location not found') {
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

  createStore = async (req: Request, res: Response): Promise<void> => {
    try {
      const storeData: StoreCreateDto = req.body;

      if (!storeData.location_code || !storeData.location_name || !storeData.location_address || !storeData.location_type) {
        res.status(400).json({
          success: false,
          message: 'location_code, location_name, location_address and location_type are required',
        });
        return;
      }

      const store = await this.storeService.createStore(storeData);

      res.status(201).json({
        success: true,
        data: store,
        message: 'Location created successfully',
      });
    } catch (error: any) {
      console.error('Create store error:', error);
      if (error.message === 'Location name already exists') {
        res.status(409).json({
          success: false,
          message: error.message,
        });
      } else if (error.message === 'Location code already exists') {
        res.status(409).json({
          success: false,
          message: error.message,
        });
      } else if (error.message.includes('Invalid location_code format')) {
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

  updateStore = async (req: Request, res: Response): Promise<void> => {
    try {
      const storeId = parseInt(req.params.id as string);
      
      if (isNaN(storeId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid location ID',
        });
        return;
      }

      const storeData: StoreUpdateDto = req.body;

      if (Object.keys(storeData).length === 0) {
        res.status(400).json({
          success: false,
          message: 'No update data provided',
        });
        return;
      }

      const store = await this.storeService.updateStore(storeId, storeData);

      res.json({
        success: true,
        data: store,
        message: 'Location updated successfully',
      });
    } catch (error: any) {
      console.error('Update store error:', error);
      if (error.message === 'Location not found') {
        res.status(404).json({
          success: false,
          message: error.message,
        });
      } else if (error.message === 'Location name already exists') {
        res.status(409).json({
          success: false,
          message: error.message,
        });
      } else if (error.message === 'Cannot modify location_code after creation') {
        res.status(403).json({
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

  toggleStoreStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const storeId = parseInt(req.params.id as string);
      const { is_active } = req.body;
      
      if (isNaN(storeId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid location ID',
        });
        return;
      }

      if (typeof is_active !== 'boolean') {
        res.status(400).json({
          success: false,
          message: 'is_active must be a boolean',
        });
        return;
      }

      const store = await this.storeService.toggleStoreStatus(storeId, is_active);

      res.json({
        success: true,
        data: store,
        message: `Location ${is_active ? 'activated' : 'deactivated'} successfully`,
      });
    } catch (error: any) {
      console.error('Toggle store status error:', error);
      if (error.message === 'Location not found') {
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

  deleteStore = async (req: Request, res: Response): Promise<void> => {
    try {
      const storeId = parseInt(req.params.id as string);
      
      if (isNaN(storeId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid location ID',
        });
        return;
      }

      await this.storeService.deleteStore(storeId);

      res.json({
        success: true,
        message: 'Location deleted successfully',
      });
    } catch (error: any) {
      console.error('Delete store error:', error);
      if (error.message === 'Location not found') {
        res.status(404).json({
          success: false,
          message: error.message,
        });
      } else if (error.message.includes('Cannot delete location with assigned users')) {
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
