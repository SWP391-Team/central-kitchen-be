import { Request, Response } from 'express';
import reworkRecordService from '../services/reworkRecordService';

export class ReworkRecordController {
  async startRework(req: Request, res: Response) {
    try {
      const { batch_id, quality_inspection_id, rework_by } = req.body;
      const created_by = (req as any).user.user_id;

      if (!batch_id || !quality_inspection_id || !rework_by) {
        return res.status(400).json({
          success: false,
          message: 'batch_id, quality_inspection_id and rework_by are required'
        });
      }

      const result = await reworkRecordService.startRework({
        batch_id,
        quality_inspection_id,
        rework_by: parseInt(rework_by),
        created_by
      }, (req as any).user);

      res.status(201).json({
        success: true,
        message: 'Rework started successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error starting rework:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to start rework'
      });
    }
  }

  async finishRework(req: Request, res: Response) {
    try {
      const reworkId = parseInt(req.params.id as string);
      const { reworkable_qty, non_reworkable_qty, note } = req.body;
      const rework_by = (req as any).user.user_id;

      const result = await reworkRecordService.finishRework(
        reworkId,
        {
          reworkable_qty,
          non_reworkable_qty,
          note
        },
        rework_by
      );

      res.status(200).json({
        success: true,
        message: 'Rework finished successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error finishing rework:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to finish rework'
      });
    }
  }

  async sendToQC(req: Request, res: Response) {
    try {
      const batch_id = parseInt(req.params.batchId as string);
      const changed_by = (req as any).user.user_id;

      const result = await reworkRecordService.sendToQC(batch_id, changed_by);

      res.status(200).json({
        success: true,
        message: 'Batch sent to QC successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error sending to QC:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to send to QC'
      });
    }
  }

  async getAllReworkRecords(req: Request, res: Response) {
    try {
      const result = await reworkRecordService.getAllReworkRecords();

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error getting rework records:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get rework records'
      });
    }
  }

  async getReworkById(req: Request, res: Response) {
    try {
      const reworkId = parseInt(req.params.id as string);

      const result = await reworkRecordService.getReworkById(reworkId);

      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Rework record not found'
        });
      }

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error getting rework record:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get rework record'
      });
    }
  }

  async getReworksByBatchId(req: Request, res: Response) {
    try {
      const batchId = parseInt(req.params.batchId as string);

      const result = await reworkRecordService.getReworksByBatchId(batchId);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error getting rework records:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get rework records'
      });
    }
  }

  async getReworksByBatchIds(req: Request, res: Response) {
    try {
      const rawIds = typeof req.query.ids === 'string' ? req.query.ids : '';
      const batchIds = rawIds
        .split(',')
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => Number.isInteger(id) && id > 0);

      if (batchIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'ids query is required (comma-separated batch IDs)'
        });
      }

      const result = await reworkRecordService.getReworksByBatchIds(batchIds);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error getting rework records by batch IDs:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get rework records'
      });
    }
  }

  async searchReworkBySuggestions(req: Request, res: Response) {
    try {
      const keyword = typeof req.query.q === 'string' ? req.query.q : undefined;
      const result = await reworkRecordService.searchReworkBySuggestions((req as any).user, keyword);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      const status = error.message?.includes('Unauthorized') ? 401 : 400;
      res.status(status).json({
        success: false,
        message: error.message || 'Failed to search rework by suggestions'
      });
    }
  }

  async undoFinishRework(req: Request, res: Response) {
    try {
      const reworkId = parseInt(req.params.id as string);
      const userId = (req as any).user.user_id;

      const result = await reworkRecordService.undoFinishRework(reworkId, userId);

      res.status(200).json({
        success: true,
        message: `Rework undone successfully. New rework ${result.newRework.rework_code} created.`,
        data: result
      });
    } catch (error: any) {
      console.error('Error undoing rework:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to undo rework'
      });
    }
  }
}

export default new ReworkRecordController();
