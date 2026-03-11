import { Request, Response } from 'express';
import qualityInspectionService from '../services/qualityInspectionService';

interface AuthRequest extends Request {
  user?: {
    user_id: number;
    username: string;
    role_id: number;
    store_id: number | null;
  };
}

export class QualityInspectionController {
  async startInspection(req: AuthRequest, res: Response) {
    try {
      const { batch_id } = req.body;

      if (!batch_id) {
        return res.status(400).json({
          success: false,
          message: 'Batch ID is required'
        });
      }

      const result = await qualityInspectionService.startInspection({
        batch_id,
        created_by: req.user!.user_id
      });

      res.status(201).json({
        success: true,
        message: 'Inspection started successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error starting inspection:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to start inspection'
      });
    }
  }

  async finishInspection(req: AuthRequest, res: Response) {
    try {
      const inspectionId = parseInt(req.params.id as string);
      const { inspection_mode, inspected_qty, passed_qty, failed_qty, inspection_result, note } = req.body;

      if (!inspection_mode || !inspected_qty || passed_qty === undefined || failed_qty === undefined || !inspection_result) {
        return res.status(400).json({
          success: false,
          message: 'All required fields must be provided'
        });
      }

      const result = await qualityInspectionService.finishInspection(
        inspectionId,
        {
          inspection_mode,
          inspected_qty: parseInt(inspected_qty),
          passed_qty: parseInt(passed_qty),
          failed_qty: parseInt(failed_qty),
          inspection_result,
          note
        },
        req.user!.user_id
      );

      res.status(200).json({
        success: true,
        message: 'Inspection finished successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error finishing inspection:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to finish inspection'
      });
    }
  }

  async reinspection(req: AuthRequest, res: Response) {
    try {
      const { batch_id } = req.body;

      if (!batch_id) {
        return res.status(400).json({
          success: false,
          message: 'Batch ID is required'
        });
      }

      const result = await qualityInspectionService.reinspection({
        batch_id,
        created_by: req.user!.user_id
      });

      res.status(201).json({
        success: true,
        message: 'Reinspection started successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error starting reinspection:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to start reinspection'
      });
    }
  }

  async rejectBatch(req: AuthRequest, res: Response) {
    try {
      const batchId = parseInt(req.params.batchId as string);

      const result = await qualityInspectionService.rejectBatch(batchId);

      res.status(200).json({
        success: true,
        message: 'Batch rejected successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error rejecting batch:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to reject batch'
      });
    }
  }

  async getQualityInspections(req: AuthRequest, res: Response) {
    try {
      const {
        search,
        status,
        page = '1',
        limit = '10',
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;

      const result = await qualityInspectionService.getQualityInspections({
        search: search as string,
        status: status as string,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        sortBy: sortBy as any,
        sortOrder: sortOrder as 'asc' | 'desc'
      });

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error: any) {
      console.error('Error getting quality inspections:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get quality inspections'
      });
    }
  }

  async getInspectionById(req: AuthRequest, res: Response) {
    try {
      const inspectionId = parseInt(req.params.id as string);

      const inspection = await qualityInspectionService.getInspectionById(inspectionId);

      if (!inspection) {
        return res.status(404).json({
          success: false,
          message: 'Inspection not found'
        });
      }

      res.status(200).json({
        success: true,
        data: inspection
      });
    } catch (error: any) {
      console.error('Error getting inspection:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get inspection'
      });
    }
  }

  async getInspectionsByBatchId(req: AuthRequest, res: Response) {
    try {
      const batchId = parseInt(req.params.batchId as string);

      const inspections = await qualityInspectionService.getInspectionsByBatchId(batchId);

      res.status(200).json({
        success: true,
        data: inspections
      });
    } catch (error: any) {
      console.error('Error getting inspections for batch:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get inspections'
      });
    }
  }

  async sendReworkRequest(req: AuthRequest, res: Response) {
    try {
      const inspectionId = parseInt(req.params.id as string);

      const result = await qualityInspectionService.sendReworkRequest(inspectionId);

      res.status(200).json({
        success: true,
        message: 'Rework request sent successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error sending rework request:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to send rework request'
      });
    }
  }
}

export default new QualityInspectionController();
