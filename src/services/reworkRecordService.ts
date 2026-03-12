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

      // Kiểm tra reworkable_qty = 0 -> Rework Failed
      if (data.reworkable_qty === 0) {
        // Status = "Rework Failed", không cho phép send to QC
        const reworkStatus = 'Rework Failed';
        const batchStatusAfterRework = 'rework_failed';

        await client.query(
          `UPDATE production_batch SET status = $1 WHERE batch_id = $2`,
          [batchStatusAfterRework, rework.batch_id]
        );

        await reworkRecordRepository.finishRework(
          reworkId,
          data,
          reworkBy,
          batchStatusAfterRework,
          reworkStatus
        );
        
        const goodQtyQuery = `
          SELECT COALESCE(SUM(passed_qty), 0) as total_passed
          FROM quality_inspection
          WHERE batch_id = $1 
            AND inspection_mode = 'full'
            AND status IN ('Passed', 'Failed')
            AND batch_status_at_inspection IN ('qc_passed', 'qc_failed')
        `;
        const goodQtyResult = await client.query(goodQtyQuery, [rework.batch_id]);
        const goodQty = parseInt(goodQtyResult.rows[0].total_passed);

        const nonReworkableQuery = `
          SELECT COALESCE(SUM(non_reworkable_qty), 0) as total_non_reworkable
          FROM rework_record
          WHERE batch_id = $1
            AND status != 'Incorrect Data'
        `;
        const nonReworkableResult = await client.query(nonReworkableQuery, [rework.batch_id]);
        const defectQty = parseInt(nonReworkableResult.rows[0].total_non_reworkable);

        await client.query(
          `UPDATE production_batch 
           SET good_qty = $1, defect_qty = $2 
           WHERE batch_id = $3`,
          [goodQty, defectQty, rework.batch_id]
        );
      } else {
        await client.query(
          `UPDATE production_batch SET status = 'reworked' WHERE batch_id = $1`,
          [rework.batch_id]
        );

        await reworkRecordRepository.finishRework(
          reworkId,
          data,
          reworkBy,
          'reworked',
          'Reworked'
        );
      }

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

  async undoFinishRework(
    reworkId: number,
    userId: number
  ): Promise<{
    oldRework: ReworkRecordWithDetails;
    newRework: ReworkRecordWithDetails;
    batch: ProductionBatch;
  }> {
    const rework = await reworkRecordRepository.findById(reworkId);
    if (!rework) {
      throw new Error('Rework record not found');
    }

    if (rework.status !== 'Reworked' && rework.status !== 'Rework Failed') {
      throw new Error('Only finished rework (Reworked or Rework Failed) can be undone');
    }

    const isLatest = await reworkRecordRepository.isMaxReworkNo(
      rework.batch_id,
      rework.rework_no
    );
    if (!isLatest) {
      throw new Error('Only the latest rework can be undone');
    }

    const batch = await productionBatchRepository.findById(rework.batch_id);
    if (!batch) {
      throw new Error('Batch not found');
    }

    const allowedStatuses = ['reworked', 'rework_failed', 'waiting_qc'];
    if (!allowedStatuses.includes(batch.status)) {
      throw new Error(
        'Cannot undo rework after inspection has started. ' +
        'Current batch status does not allow undo.'
      );
    }

    if (rework.rework_date) {
      const inspectionsAfterRework = await qualityInspectionRepository.findByBatchId(rework.batch_id);
      const hasInspectionAfter = inspectionsAfterRework.some(
        (insp) => new Date(insp.created_at) > new Date(rework.rework_date!)
      );
      
      if (hasInspectionAfter) {
        throw new Error('Cannot undo rework after inspection has started');
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let targetBatchStatus = 'reworking';
      if (batch.status === 'waiting_qc') {
        targetBatchStatus = 'reworked';
        await client.query(
          `UPDATE production_batch SET status = $1 WHERE batch_id = $2`,
          [targetBatchStatus, rework.batch_id]
        );
      }

      await client.query(
        `UPDATE production_batch SET status = 'reworking' WHERE batch_id = $1`,
        [rework.batch_id]
      );

      if (rework.status === 'Rework Failed') {
        await client.query(
          `UPDATE production_batch 
           SET good_qty = NULL, defect_qty = NULL 
           WHERE batch_id = $1`,
          [rework.batch_id]
        );
      }

      await reworkRecordRepository.markAsIncorrectData(reworkId);

      const newReworkRecord = await reworkRecordRepository.createReworkFromOld(
        rework,
        userId
      );

      await client.query('COMMIT');

      const oldReworkFull = await reworkRecordRepository.findById(reworkId);
      const newReworkFull = await reworkRecordRepository.findById(newReworkRecord.rework_id);
      const updatedBatch = await productionBatchRepository.findById(rework.batch_id);

      return {
        oldRework: oldReworkFull!,
        newRework: newReworkFull!,
        batch: updatedBatch!
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export default new ReworkRecordService();
