import { Request, Response } from 'express';
import { LocationService } from '../services/locationService';
import { LocationCreateDto, LocationUpdateDto } from '../models/Location';

export class LocationController {
  private locationService: LocationService;

  constructor() {
    this.locationService = new LocationService();
  }

  getAllLocations = async (req: Request, res: Response): Promise<void> => {
    try {
      const { search, is_active, location_type } = req.query;
      
      const params: any = {};
      if (search) params.search = search as string;
      if (is_active !== undefined) params.is_active = is_active === 'true';
      if (location_type) params.location_type = location_type as string;

      const locations = await this.locationService.getAllLocations(params);
      res.json({
        success: true,
        data: locations,
      });
    } catch (error) {
      console.error('Get all stores error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  getLocationById = async (req: Request, res: Response): Promise<void> => {
    try {
      const locationId = parseInt(req.params.id as string);
      
      if (isNaN(locationId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid location ID',
        });
        return;
      }

      const location = await this.locationService.getLocationById(locationId);
      
      res.json({
        success: true,
        data: location,
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

  createLocation = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const locationData: LocationCreateDto = req.body;

      if (!locationData.location_code || !locationData.location_name || !locationData.location_address || !locationData.location_type) {
        res.status(400).json({
          success: false,
          message: 'location_code, location_name, location_address and location_type are required',
        });
        return;
      }

      const location = await this.locationService.createLocation(locationData, req.user.user_id);

      res.status(201).json({
        success: true,
        data: location,
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

  updateLocation = async (req: Request, res: Response): Promise<void> => {
    try {
      const locationId = parseInt(req.params.id as string);
      
      if (isNaN(locationId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid location ID',
        });
        return;
      }

      const locationData: LocationUpdateDto = req.body;

      if (Object.keys(locationData).length === 0) {
        res.status(400).json({
          success: false,
          message: 'No update data provided',
        });
        return;
      }

      const location = await this.locationService.updateLocation(locationId, locationData);

      res.json({
        success: true,
        data: location,
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

  toggleLocationStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const locationId = parseInt(req.params.id as string);
      const { is_active } = req.body;
      
      if (isNaN(locationId)) {
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

      const location = await this.locationService.toggleLocationStatus(locationId, is_active);

      res.json({
        success: true,
        data: location,
        message: `Location ${is_active ? 'activated' : 'deactivated'} successfully`,
      });
    } catch (error: any) {
      console.error('Toggle store status error:', error);
      if (error.message === 'Location not found') {
        res.status(404).json({
          success: false,
          message: error.message,
        });
      } else if (error.message?.startsWith('Cannot deactivate location:')) {
        res.status(409).json({
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

  deleteLocation = async (req: Request, res: Response): Promise<void> => {
    try {
      const locationId = parseInt(req.params.id as string);
      
      if (isNaN(locationId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid location ID',
        });
        return;
      }

      await this.locationService.deleteLocation(locationId);

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
