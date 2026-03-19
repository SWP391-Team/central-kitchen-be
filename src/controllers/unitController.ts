import { Request, Response } from 'express';
import unitService from '../services/unitService';
import { UnitCreateDto, UnitUpdateDto } from '../models/Unit';

export class UnitController {
  getAllUnits = async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, q } = req.query;
      let isActive: boolean | undefined;

      if (status === 'active') {
        isActive = true;
      } else if (status === 'inactive') {
        isActive = false;
      }

      const units = await unitService.getAllUnits({
        isActive,
        search: (q as string) || undefined,
      });

      res.json({
        success: true,
        data: units,
      });
    } catch (error) {
      console.error('Get all units error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  getActiveUnits = async (req: Request, res: Response): Promise<void> => {
    try {
      const units = await unitService.getActiveUnits();
      res.json({
        success: true,
        data: units,
      });
    } catch (error) {
      console.error('Get active units error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  getUnitById = async (req: Request, res: Response): Promise<void> => {
    try {
      const unitId = parseInt(req.params.id as string, 10);

      if (isNaN(unitId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid unit ID',
        });
        return;
      }

      const unit = await unitService.getUnitById(unitId);
      res.json({
        success: true,
        data: unit,
      });
    } catch (error: any) {
      console.error('Get unit by ID error:', error);
      if (error.message === 'Unit not found') {
        res.status(404).json({
          success: false,
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  createUnit = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const unitData: UnitCreateDto = req.body;
      const createdUnit = await unitService.createUnit(unitData, req.user.user_id);

      res.status(201).json({
        success: true,
        message: 'Unit created successfully',
        data: createdUnit,
      });
    } catch (error: any) {
      console.error('Create unit error:', error);

      if (error.message.includes('required') || error.message.includes('already exists')) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  updateUnit = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const unitId = parseInt(req.params.id as string, 10);
      if (isNaN(unitId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid unit ID',
        });
        return;
      }

      const unitData: UnitUpdateDto = req.body;
      const updatedUnit = await unitService.updateUnit(unitId, unitData, req.user.user_id);

      res.json({
        success: true,
        message: 'Unit updated successfully',
        data: updatedUnit,
      });
    } catch (error: any) {
      console.error('Update unit error:', error);

      if (error.message === 'Unit not found') {
        res.status(404).json({
          success: false,
          message: error.message,
        });
        return;
      }

      if (error.message.includes('already exists') || error.message.includes('cannot be empty')) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  toggleUnitActive = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const unitId = parseInt(req.params.id as string, 10);
      if (isNaN(unitId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid unit ID',
        });
        return;
      }

      const updatedUnit = await unitService.toggleUnitActive(unitId, req.user.user_id);

      res.json({
        success: true,
        message: `Unit ${updatedUnit.is_active ? 'activated' : 'deactivated'} successfully`,
        data: updatedUnit,
      });
    } catch (error: any) {
      console.error('Toggle unit active error:', error);

      if (error.message === 'Unit not found') {
        res.status(404).json({
          success: false,
          message: error.message,
        });
        return;
      }

      if (error.message?.startsWith('Cannot deactivate unit:')) {
        res.status(409).json({
          success: false,
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };
}

export default new UnitController();
