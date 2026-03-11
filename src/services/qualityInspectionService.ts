import qualityInspectionRepository from '../repositories/qualityInspectionRepository';
import productionBatchRepository from '../repositories/productionBatchRepository';
import reworkRecordRepository from '../repositories/reworkRecordRepository';
import pool from '../config/database';
import { 
  QualityInspectionCreateDto, 
  QualityInspectionFinishDto, 
  QualityInspectionWithDetails 
} from '../models/QualityInspection';
import { ProductionBatch } from '../models/ProductionBatch';

interface GetQualityInspectionsParams {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
  sortBy?: 'created_at' | 'quality_inspection_code' | 'inspected_at';
  sortOrder?: 'asc' | 'desc';
}

export class QualityInspectionService {
  async startInspection(data: QualityInspectionCreateDto): Promise<{
    inspection: QualityInspectionWithDetails;
    batch: ProductionBatch;
  }> {
    const batch = await productionBatchRepository.findById(data.batch_id);
    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.status !== 'waiting_qc') {
      throw new Error('Batch must be in waiting_qc status to start inspection');
    }

    const hasActive = await qualityInspectionRepository.hasActiveInspection(data.batch_id);
    if (hasActive) {
      throw new Error('There is already an active inspection for this batch');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const inspection = await qualityInspectionRepository.startInspection(data);

      await client.query(
        `UPDATE production_batch SET status = 'under_qc' WHERE batch_id = $1`,
        [data.batch_id]
      );

      await client.query('COMMIT');

      const fullInspection = await qualityInspectionRepository.findById(inspection.quality_inspection_id);
      const updatedBatch = await productionBatchRepository.findById(data.batch_id);

      return {
        inspection: fullInspection!,
        batch: updatedBatch!
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async finishInspection(
    inspectionId: number,
    data: QualityInspectionFinishDto,
    inspectedBy: number
  ): Promise<{
    inspection: QualityInspectionWithDetails;
    batch: ProductionBatch;
  }> {
    const inspection = await qualityInspectionRepository.findById(inspectionId);
    if (!inspection) {
      throw new Error('Inspection not found');
    }

    if (inspection.status !== 'Inspecting') {
      throw new Error('Inspection must be in Inspecting status');
    }

    const batch = await productionBatchRepository.findById(inspection.batch_id);
    if (!batch) {
      throw new Error('Batch not found');
    }

    const completedReworks = await reworkRecordRepository.getCompletedReworksBeforeDate(
      inspection.batch_id,
      new Date(inspection.created_at)
    );
    
    let sourceQty = batch.produced_qty!;
    if (completedReworks.length > 0) {
      const latestRework = completedReworks[completedReworks.length - 1];
      sourceQty = latestRework.reworkable_qty!;
    }

    if (data.inspected_qty > sourceQty) {
      throw new Error(`Inspected quantity (${data.inspected_qty}) cannot exceed source quantity (${sourceQty})`);
    }

    if (data.passed_qty + data.failed_qty !== data.inspected_qty) {
      throw new Error('Passed quantity + Failed quantity must equal Inspected quantity');
    }

    if (data.inspection_mode === 'full' && data.inspected_qty !== sourceQty) {
      throw new Error(`For full inspection, inspected quantity must equal source quantity (${sourceQty})`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const newBatchStatus = data.inspection_result === 'Pass' ? 'qc_passed' : 'qc_failed';

      const updatedInspection = await qualityInspectionRepository.finishInspection(
        inspectionId,
        data,
        inspectedBy,
        newBatchStatus
      );

      await client.query(
        `UPDATE production_batch SET status = $1 WHERE batch_id = $2`,
        [newBatchStatus, inspection.batch_id]
      );

      if (data.inspection_result === 'Pass') {
        const isMaxInspection = await qualityInspectionRepository.isMaxInspectionNo(
          inspection.batch_id,
          inspection.inspection_no
        );

        if (isMaxInspection) {
          const samplingPassedQuery = `
            SELECT quality_inspection_id 
            FROM quality_inspection
            WHERE batch_id = $1 
              AND inspection_mode = 'sampling'
              AND status = 'Passed'
              AND batch_status_at_inspection = 'qc_passed'
            LIMIT 1
          `;
          const samplingResult = await client.query(samplingPassedQuery, [inspection.batch_id]);
          
          let goodQty = 0;
          let defectQty = 0;

          if (samplingResult.rows.length > 0) {
            goodQty = batch.produced_qty!;
            defectQty = 0;
          } else {
            const goodQtyQuery = `
              SELECT COALESCE(SUM(passed_qty), 0) as total_passed
              FROM quality_inspection
              WHERE batch_id = $1 
                AND inspection_mode = 'full'
                AND status IN ('Passed', 'Failed')
                AND batch_status_at_inspection IN ('qc_passed', 'qc_failed')
            `;
            const goodQtyResult = await client.query(goodQtyQuery, [inspection.batch_id]);
            goodQty = parseInt(goodQtyResult.rows[0].total_passed);

            const nonReworkableQuery = `
              SELECT COALESCE(SUM(non_reworkable_qty), 0) as total_non_reworkable
              FROM rework_record
              WHERE batch_id = $1
            `;
            const nonReworkableResult = await client.query(nonReworkableQuery, [inspection.batch_id]);
            const totalNonReworkable = parseInt(nonReworkableResult.rows[0].total_non_reworkable);

            const lastFullInspectionQuery = `
              SELECT failed_qty
              FROM quality_inspection
              WHERE batch_id = $1 
                AND inspection_mode = 'full'
                AND status IN ('Passed', 'Failed')
                AND batch_status_at_inspection IN ('qc_passed', 'qc_failed')
              ORDER BY inspection_no DESC
              LIMIT 1
            `;
            const lastFullResult = await client.query(lastFullInspectionQuery, [inspection.batch_id]);
            const lastFullFailedQty = lastFullResult.rows.length > 0 ? (lastFullResult.rows[0].failed_qty || 0) : 0;

            defectQty = totalNonReworkable + lastFullFailedQty;
          }

          await client.query(
            `UPDATE production_batch 
             SET good_qty = $1, defect_qty = $2 
             WHERE batch_id = $3`,
            [goodQty, defectQty, inspection.batch_id]
          );
        }
      }

      await client.query('COMMIT');

      const fullInspection = await qualityInspectionRepository.findById(inspectionId);
      const updatedBatch = await productionBatchRepository.findById(inspection.batch_id);

      return {
        inspection: fullInspection!,
        batch: updatedBatch!
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async reinspection(data: QualityInspectionCreateDto): Promise<{
    inspection: QualityInspectionWithDetails;
    batch: ProductionBatch;
  }> {
    const batch = await productionBatchRepository.findById(data.batch_id);
    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.status !== 'qc_failed') {
      throw new Error('Only failed batches can be reinspected');
    }

    const hasActive = await qualityInspectionRepository.hasActiveInspection(data.batch_id);
    if (hasActive) {
      throw new Error('There is already an active inspection for this batch');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const inspection = await qualityInspectionRepository.startInspection(data);

      await client.query(
        `UPDATE production_batch SET status = 'under_qc' WHERE batch_id = $1`,
        [data.batch_id]
      );

      await client.query('COMMIT');

      const fullInspection = await qualityInspectionRepository.findById(inspection.quality_inspection_id);
      const updatedBatch = await productionBatchRepository.findById(data.batch_id);

      return {
        inspection: fullInspection!,
        batch: updatedBatch!
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async rejectBatch(batchId: number): Promise<ProductionBatch> {
    const batch = await productionBatchRepository.findById(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.status !== 'qc_failed') {
      throw new Error('Only failed batches can be rejected');
    }

    const inspections = await qualityInspectionRepository.findByBatchId(batchId);
    if (inspections.length === 0) {
      throw new Error('No inspections found for this batch');
    }

    const latestInspection = inspections[0]; 
    if (latestInspection.status !== 'Failed') {
      throw new Error('Latest inspection must be Failed to reject batch');
    }

    const isMax = await qualityInspectionRepository.isMaxInspectionNo(
      batchId,
      latestInspection.inspection_no
    );
    if (!isMax) {
      throw new Error('Can only reject based on latest inspection');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE production_batch 
         SET status = 'rejected' 
         WHERE batch_id = $1`,
        [batchId]
      );

      await client.query(
        `UPDATE quality_inspection 
         SET batch_status_at_inspection = 'rejected' 
         WHERE quality_inspection_id = $1`,
        [latestInspection.quality_inspection_id]
      );

      const samplingPassedQuery = `
        SELECT quality_inspection_id 
        FROM quality_inspection
        WHERE batch_id = $1 
          AND inspection_mode = 'sampling'
          AND status = 'Passed'
          AND batch_status_at_inspection = 'qc_passed'
        LIMIT 1
      `;
      const samplingResult = await client.query(samplingPassedQuery, [batchId]);
      
      let goodQty = 0;
      let defectQty = 0;

      if (samplingResult.rows.length > 0) {
        goodQty = batch.produced_qty!;
        defectQty = 0;
      } else {
        const goodQtyQuery = `
          SELECT COALESCE(SUM(passed_qty), 0) as total_passed
          FROM quality_inspection
          WHERE batch_id = $1 
            AND inspection_mode = 'full'
            AND status IN ('Passed', 'Failed')
            AND batch_status_at_inspection IN ('qc_passed', 'qc_failed')
        `;
        const goodQtyResult = await client.query(goodQtyQuery, [batchId]);
        goodQty = parseInt(goodQtyResult.rows[0].total_passed);

        const nonReworkableQuery = `
          SELECT COALESCE(SUM(non_reworkable_qty), 0) as total_non_reworkable
          FROM rework_record
          WHERE batch_id = $1
        `;
        const nonReworkableResult = await client.query(nonReworkableQuery, [batchId]);
        const totalNonReworkable = parseInt(nonReworkableResult.rows[0].total_non_reworkable);

        const lastFullInspectionQuery = `
          SELECT failed_qty
          FROM quality_inspection
          WHERE batch_id = $1 
            AND inspection_mode = 'full'
            AND status IN ('Passed', 'Failed')
            AND batch_status_at_inspection IN ('qc_passed', 'qc_failed')
          ORDER BY inspection_no DESC
          LIMIT 1
        `;
        const lastFullResult = await client.query(lastFullInspectionQuery, [batchId]);
        const lastFullFailedQty = lastFullResult.rows.length > 0 ? (lastFullResult.rows[0].failed_qty || 0) : 0;

        defectQty = totalNonReworkable + lastFullFailedQty;
      }

      await client.query(
        `UPDATE production_batch 
         SET good_qty = $1, defect_qty = $2 
         WHERE batch_id = $3`,
        [goodQty, defectQty, batchId]
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

  async getQualityInspections(params: GetQualityInspectionsParams): Promise<{
    data: QualityInspectionWithDetails[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = params.page || 1;
    const limit = params.limit || 10;

    const result = await qualityInspectionRepository.getAll(params);

    return {
      data: result.data,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit)
      }
    };
  }

  async getInspectionById(inspectionId: number): Promise<QualityInspectionWithDetails | null> {
    return qualityInspectionRepository.findById(inspectionId);
  }

  async getInspectionsByBatchId(batchId: number): Promise<QualityInspectionWithDetails[]> {
    return qualityInspectionRepository.findByBatchId(batchId);
  }

  async sendReworkRequest(inspectionId: number): Promise<ProductionBatch> {
    const inspection = await qualityInspectionRepository.findById(inspectionId);
    if (!inspection) {
      throw new Error('Inspection not found');
    }

    if (inspection.status !== 'Failed') {
      throw new Error('Only failed inspections can send rework request');
    }

    const batch = await productionBatchRepository.findById(inspection.batch_id);
    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.status !== 'qc_failed') {
      throw new Error('Batch must be in qc_failed status');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE production_batch SET status = 'rework_required' WHERE batch_id = $1`,
        [inspection.batch_id]
      );

      await client.query('COMMIT');

      const updatedBatch = await productionBatchRepository.findById(inspection.batch_id);
      return updatedBatch!;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export default new QualityInspectionService();
