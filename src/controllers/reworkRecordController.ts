import { Request, Response } from 'express';
import reworkRecordService from '../services/reworkRecordService';

export class ReworkRecordController {
  async startRework(req: Request, res: Response) {
    try {
      const { batch_id, quality_inspection_id } = req.body;
      const created_by = (req as any).user.user_id;

      const result = await reworkRecordService.startRework({
        batch_id,
        quality_inspection_id,
        created_by
      });

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
