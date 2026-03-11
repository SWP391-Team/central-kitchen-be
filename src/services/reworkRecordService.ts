import reworkRecordRepository from '../repositories/reworkRecordRepository';
import productionBatchRepository from '../repositories/productionBatchRepository';
import qualityInspectionRepository from '../repositories/qualityInspectionRepository';
import pool from '../config/database';
import { ReworkRecordCreateDto, ReworkRecordFinishDto, ReworkRecordWithDetails } from '../models/ReworkRecord';
import { ProductionBatch } from '../models/ProductionBatch';

export class ReworkRecordService {
  async startRework(data: ReworkRecordCreateDto): Promise<{
    rework: ReworkRecordWithDetails;
    batch: ProductionBatch;
  }> {
    const batch = await productionBatchRepository.findById(data.batch_id);
    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.status !== 'rework_required') {
      throw new Error('Batch must be in rework_required status to start rework');
    }

    const hasActive = await reworkRecordRepository.hasActiveRework(data.batch_id);
    if (hasActive) {
      throw new Error('There is already an active rework for this batch');
    }

    const inspection = await qualityInspectionRepository.findById(data.quality_inspection_id);
    if (!inspection) {
      throw new Error('Quality inspection not found');
    }

    if (inspection.status !== 'Failed') {
      throw new Error('Quality inspection must have Failed status');
    }

    const reworkQty = inspection.failed_qty || 0;
    if (reworkQty <= 0) {
      throw new Error('Failed quantity must be greater than 0');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const rework = await reworkRecordRepository.startRework(data, reworkQty);

      await client.query(
        `UPDATE production_batch SET status = 'reworking' WHERE batch_id = $1`,
        [data.batch_id]
      );

      await client.query('COMMIT');

      const fullRework = await reworkRecordRepository.findById(rework.rework_id);
      const updatedBatch = await productionBatchRepository.findById(data.batch_id);

      return {
        rework: fullRework!,
        batch: updatedBatch!
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async finishRework(
    reworkId: number,
    data: ReworkRecordFinishDto,
    reworkBy: number
  ): Promise<{
    rework: ReworkRecordWithDetails;
    batch: ProductionBatch;
  }> {
    const rework = await reworkRecordRepository.findById(reworkId);
    if (!rework) {
      throw new Error('Rework record not found');
    }

    if (rework.status !== 'Reworking') {
      throw new Error('Rework must be in Reworking status');
    }

    if (data.reworkable_qty < 0 || data.non_reworkable_qty < 0) {
      throw new Error('Quantities cannot be negative');
    }

    if (data.reworkable_qty > rework.rework_qty || data.non_reworkable_qty > rework.rework_qty) {
      throw new Error('Quantities cannot exceed rework quantity');
    }

    if (data.reworkable_qty + data.non_reworkable_qty !== rework.rework_qty) {
      throw new Error('Reworkable quantity + Non-reworkable quantity must equal Rework quantity');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE production_batch SET status = 'reworked' WHERE batch_id = $1`,
        [rework.batch_id]
      );

      const updatedRework = await reworkRecordRepository.finishRework(
        reworkId,
        data,
        reworkBy,
        'reworked' 
      );

      await client.query('COMMIT');

      const fullRework = await reworkRecordRepository.findById(reworkId);
      const updatedBatch = await productionBatchRepository.findById(rework.batch_id);

      return {
        rework: fullRework!,
        batch: updatedBatch!
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async sendToQC(batchId: number): Promise<ProductionBatch> {
    const batch = await productionBatchRepository.findById(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.status !== 'reworked') {
      throw new Error('Only reworked batches can be sent to QC');
    }

    const latestRework = await reworkRecordRepository.getLatestReworkByBatchId(batchId);
    if (!latestRework) {
      throw new Error('No rework record found for this batch');
    }

    const isMaxRework = await reworkRecordRepository.isMaxReworkNo(batchId, latestRework.rework_no);
    if (!isMaxRework) {
      throw new Error('Only the latest rework can be sent to QC');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE production_batch SET status = 'waiting_qc' WHERE batch_id = $1`,
        [batchId]
      );

      await client.query('COMMIT');

      const updatedBatch = await productionBatchRepository.findById(batchId);
      return updatedBatch!;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getAllReworkRecords(): Promise<ReworkRecordWithDetails[]> {
    return await reworkRecordRepository.getAll();
  }

  async getReworkById(reworkId: number): Promise<ReworkRecordWithDetails | null> {
    return await reworkRecordRepository.findById(reworkId);
  }

  async getReworksByBatchId(batchId: number): Promise<ReworkRecordWithDetails[]> {
    return await reworkRecordRepository.findByBatchId(batchId);
  }
}

export default new ReworkRecordService();
