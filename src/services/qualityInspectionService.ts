import qualityInspectionRepository from '../repositories/qualityInspectionRepository';
import productionBatchRepository from '../repositories/productionBatchRepository';
import reworkRecordRepository from '../repositories/reworkRecordRepository';
import inventoryRepository from '../repositories/inventoryRepository';
import pool from '../config/database';
import { 
  InspectedBySuggestion,
  QualityInspectionCreateDto, 
  QualityInspectionFinishDto, 
  QualityInspectionWithDetails 
} from '../models/QualityInspection';
import { ProductionBatch } from '../models/ProductionBatch';

type AuthUser = {
  user_id: number;
  username: string;
  role_id: number;
  location_id: number | null;
  location_ids: number[];
};

interface GetQualityInspectionsParams {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
  sortBy?: 'created_at' | 'quality_inspection_code' | 'inspected_at';
  sortOrder?: 'asc' | 'desc';
}

export class QualityInspectionService {
  private async resolveQcLocationId(user?: AuthUser): Promise<number> {
    const userLocationIds = Array.isArray(user?.location_ids)
      ? user!.location_ids.filter((id) => Number.isInteger(id) && id > 0)
      : [];

    if (userLocationIds.length > 0) {
      const scopedResult = await pool.query(
        `SELECT location_id
         FROM location
         WHERE is_active = true
           AND location_type = 'CK_PRODUCTION'
           AND location_id = ANY($1::int[])
         ORDER BY location_id ASC
         LIMIT 1`,
        [userLocationIds]
      );

      if (scopedResult.rows.length > 0) {
        return scopedResult.rows[0].location_id;
      }
    }

    const fallbackResult = await pool.query(
      `SELECT location_id
       FROM location
       WHERE is_active = true
         AND location_type = 'CK_PRODUCTION'
       ORDER BY location_id ASC
       LIMIT 1`
    );

    if (fallbackResult.rows.length === 0) {
      throw new Error('QC location not found');
    }

    return fallbackResult.rows[0].location_id;
  }

  private async validateInspectedByUser(inspectedBy: number, locationId: number): Promise<void> {
    const result = await pool.query(
      `SELECT u.user_id
       FROM "user" u
       WHERE u.user_id = $1
         AND u.is_active = true
         AND (
           u.location_id = $2
           OR EXISTS (
             SELECT 1
             FROM user_location ul
             WHERE ul.user_id = u.user_id
               AND ul.location_id = $2
           )
         )
       LIMIT 1`,
      [inspectedBy, locationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Inspect By user is invalid or not in corresponding QC location');
    }
  }

  async startInspection(data: QualityInspectionCreateDto, authUser?: AuthUser): Promise<{
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

    if (!data.inspect_by || data.inspect_by <= 0) {
      throw new Error('Inspect By is required');
    }

    await this.validateInspectedByUser(data.inspect_by, await this.resolveQcLocationId(authUser));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const inspection = await qualityInspectionRepository.startInspection(data);

      await productionBatchRepository.updateStatusWithHistory(data.batch_id, 'under_qc', {
        client,
        changed_by: data.created_by,
        note: 'QC inspection started',
      });

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

    if (data.inspection_mode === 'full' && data.failed_qty === 0 && data.inspection_result !== 'Pass') {
      throw new Error('Full inspection with failed quantity = 0 must have result Pass');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const newBatchStatus = data.inspection_result === 'Pass' ? 'qc_passed' : 'qc_failed';

      const finishedInspection = await qualityInspectionRepository.finishInspection(
        inspectionId,
        data,
        inspectedBy,
        newBatchStatus
      );
      if (!finishedInspection) {
        throw new Error('Failed to update inspection result');
      }

      await productionBatchRepository.updateStatusWithHistory(inspection.batch_id, newBatchStatus, {
        client,
        changed_by: inspectedBy,
        note: `QC inspection finished: ${data.inspection_result}`,
      });

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
                AND status != 'Incorrect Data'
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

          if (goodQty > 0) {
            const alreadyHasInventory =
              await inventoryRepository.existsProductionTransaction(
                inspection.batch_id,
                client
              );
            if (!alreadyHasInventory) {
              const ckProdRows = await client.query(
                `SELECT location_id FROM location
                 WHERE location_type = 'CK_PRODUCTION' AND is_active = true
                 LIMIT 1`
              );
              if (ckProdRows.rows.length > 0) {
                const ckProdLocationId = ckProdRows.rows[0].location_id;
                await inventoryRepository.createTransactionWithClient(client, {
                  location_id: ckProdLocationId,
                  product_id: batch.product_id,
                  batch_id: inspection.batch_id,
                  reference_type: 'production_batch',
                  reference_id: inspection.batch_id,
                  qty: goodQty,
                  transaction_type: 'IN',
                });
                await inventoryRepository.upsertBatchInventoryWithClient(client, {
                  location_id: ckProdLocationId,
                  product_id: batch.product_id,
                  batch_id: inspection.batch_id,
                  qty_change: goodQty,
                });
              }
            }
          }
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

    if (!data.inspect_by) {
      data.inspect_by = data.created_by;
    }

    await this.validateInspectedByUser(
      data.inspect_by,
      await this.resolveQcLocationId()
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const inspection = await qualityInspectionRepository.startInspection(data);

      await productionBatchRepository.updateStatusWithHistory(data.batch_id, 'under_qc', {
        client,
        changed_by: data.created_by,
        note: 'QC reinspection started',
      });

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

  async rejectBatch(batchId: number, rejectBy?: number): Promise<ProductionBatch> {
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

      await productionBatchRepository.updateStatusWithHistory(batchId, 'rejected', {
        client,
        changed_by: rejectBy ?? null,
        note: 'Batch rejected after QC failed',
      });

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
            AND status != 'Incorrect Data'
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

  async searchInspectedBySuggestions(user: AuthUser | undefined, keyword?: string): Promise<InspectedBySuggestion[]> {
    if (!user) {
      throw new Error('Unauthorized');
    }

    const locationId = await this.resolveQcLocationId(user);
    const values: any[] = [locationId];
    let where = `
      u.is_active = true
      AND (
        u.location_id = $1
        OR EXISTS (
          SELECT 1
          FROM user_location ul
          WHERE ul.user_id = u.user_id
            AND ul.location_id = $1
        )
      )
    `;

    if (keyword && keyword.trim()) {
      values.push(`%${keyword.trim()}%`);
      where += ` AND (u.username ILIKE $2 OR u.user_code ILIKE $2)`;
    }

    const result = await pool.query(
      `SELECT u.user_id, u.user_code, u.username
       FROM "user" u
       WHERE ${where}
       ORDER BY u.username ASC
       LIMIT 20`,
      values
    );

    return result.rows;
  }

  async sendReworkRequest(inspectionId: number, requestedBy?: number): Promise<ProductionBatch> {
    const inspection = await qualityInspectionRepository.findById(inspectionId);
    if (!inspection) {
      throw new Error('Inspection not found');
    }

    if (inspection.status !== 'Failed') {
      throw new Error('Only failed inspections can send rework request');
    }

    if (inspection.inspection_mode === 'sampling') {
      throw new Error('Cannot send rework request for failed sampling inspections');
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

      await productionBatchRepository.updateStatusWithHistory(inspection.batch_id, 'rework_required', {
        client,
        changed_by: requestedBy ?? null,
        note: 'Rework requested from QC',
      });

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

  async undoInspection(
    inspectionId: number,
    userId: number
  ): Promise<{
    oldInspection: QualityInspectionWithDetails;
    newInspection: QualityInspectionWithDetails;
    batch: ProductionBatch;
  }> {
    const inspection = await qualityInspectionRepository.findById(inspectionId);
    if (!inspection) {
      throw new Error('Inspection not found');
    }

    if (inspection.status !== 'Failed' && inspection.status !== 'Passed') {
      throw new Error('Can only undo Passed or Failed inspections');
    }

    const batch = await productionBatchRepository.findById(inspection.batch_id);
    if (!batch) {
      throw new Error('Batch not found');
    }

    const isMaxInspection = await qualityInspectionRepository.isMaxInspectionNo(
      inspection.batch_id,
      inspection.inspection_no
    );
    if (!isMaxInspection) {
      throw new Error('Can only undo the latest inspection');
    }

    const allowedStatuses = ['qc_failed', 'qc_passed', 'rework_required'];
    if (!allowedStatuses.includes(batch.status)) {
      throw new Error(
        `Cannot undo inspection when batch status is ${batch.status}. ` + 
        'Allowed statuses: qc_failed, qc_passed, rework_required'
      );
    }

    const hasRework = await reworkRecordRepository.hasAnyRework(inspection.batch_id);
    if (hasRework) {
      throw new Error(
        'Cannot undo inspection after rework has started. ' +
        'Please complete the rework process and perform a new inspection.'
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await qualityInspectionRepository.markAsIncorrectData(inspectionId);

      const newInspectionRecord = await qualityInspectionRepository.createInspectionFromOld(
        inspection,
        userId
      );

      await productionBatchRepository.updateStatusWithHistory(inspection.batch_id, 'under_qc', {
        client,
        changed_by: userId,
        note: 'Undo QC inspection',
      });

      await client.query('COMMIT');

      const oldInspection = await qualityInspectionRepository.findById(inspectionId);
      const newInspection = await qualityInspectionRepository.findById(newInspectionRecord.quality_inspection_id);
      const updatedBatch = await productionBatchRepository.findById(inspection.batch_id);

      return {
        oldInspection: oldInspection!,
        newInspection: newInspection!,
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

export default new QualityInspectionService();
