import productionBatchRepository from '../repositories/productionBatchRepository';
import productionPlanRepository from '../repositories/productionPlanRepository';
import qualityInspectionRepository from '../repositories/qualityInspectionRepository';
import { ProductRepository } from '../repositories/productRepository';
import pool from '../config/database';
import { ProducedBySuggestion, ProductionBatchCreateDto, ProductionBatchFinishDto } from '../models/ProductionBatch';

const productRepository = new ProductRepository();

type AuthUser = {
  user_id: number;
  username: string;
  role_id: number;
  location_id: number | null;
  location_ids: number[];
};

export class ProductionBatchService {
  private async resolveProductionLocationId(user?: AuthUser): Promise<number> {
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
      throw new Error('CK Production location not found');
    }

    return fallbackResult.rows[0].location_id;
  }

  private async validateProducedByUser(producedBy: number, locationId: number): Promise<void> {
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
      [producedBy, locationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Produced By user is invalid or not in corresponding production location');
    }
  }

  async createBatch(batchData: ProductionBatchCreateDto, authUser?: AuthUser): Promise<any> {
    const plan = await productionPlanRepository.findById(batchData.plan_id);
    if (!plan) {
      throw new Error('Production plan not found');
    }

    if (plan.status !== 'planned' && plan.status !== 'in_production') {
      throw new Error('Can only create batch for plans with status "planned" or "in_production"');
    }

    const product = await productRepository.findById(batchData.product_id);
    if (!product) {
      throw new Error('Product not found');
    }

    if (plan.product_id !== batchData.product_id) {
      throw new Error('Product does not match production plan');
    }

    if (!batchData.produced_by || batchData.produced_by <= 0) {
      throw new Error('Produced By is required');
    }

    const productionLocationId = await this.resolveProductionLocationId(authUser);
    await this.validateProducedByUser(batchData.produced_by, productionLocationId);

    const batch = await productionBatchRepository.createEmptyBatch(batchData);

    if (plan.status === 'planned') {
      await productionPlanRepository.updateStatus(batchData.plan_id, 'in_production');
    }

    const updatedPlan = await productionPlanRepository.findById(batchData.plan_id);

    return {
      batch,
      plan: updatedPlan
    };
  }

  async finishProduction(batchId: number, finishData: ProductionBatchFinishDto): Promise<any> {
    const batch = await productionBatchRepository.findById(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.status !== 'producing') {
      throw new Error('Can only finish batches with status "producing"');
    }

    if (finishData.produced_qty <= 0) {
      throw new Error('Produced quantity must be greater than 0');
    }

    const productionDate = new Date(finishData.production_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (productionDate < today) {
      throw new Error('Production date cannot be in the past');
    }

    const expiredDate = new Date(finishData.expired_date);
    if (expiredDate <= productionDate) {
      throw new Error('Expired date must be after production date');
    }

    const updatedBatch = await productionBatchRepository.finishProduction(batchId, finishData);

    if (!updatedBatch) {
      throw new Error('Failed to finish production');
    }

    await productionPlanRepository.updateQuantities(batch.plan_id);
    await productionPlanRepository.updateAutoStatus(batch.plan_id);

    const updatedPlan = await productionPlanRepository.findById(batch.plan_id);

    return {
      batch: updatedBatch,
      plan: updatedPlan
    };
  }

  async produceBatch(batchData: ProductionBatchCreateDto): Promise<any> {
    return this.createBatch(batchData);
  }

  async getNextBatchCodePreview(): Promise<string> {
    return productionBatchRepository.getNextBatchCode();
  }

  async searchProducedBySuggestions(user: AuthUser | undefined, keyword?: string): Promise<ProducedBySuggestion[]> {
    if (!user) {
      throw new Error('Unauthorized');
    }

    const locationId = await this.resolveProductionLocationId(user);
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

  async getBatchesByPlanId(planId: number): Promise<any> {
    return await productionBatchRepository.findByPlanId(planId);
  }

  async getBatchById(batchId: number): Promise<any> {
    const batch = await productionBatchRepository.findById(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }
    return batch;
  }

  async cancelBatch(batchId: number, changedBy?: number): Promise<any> {
    const batch = await productionBatchRepository.findById(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.status === 'cancelled') {
      throw new Error('Batch is already cancelled');
    }

    if (batch.status !== 'producing' && batch.status !== 'produced') {
      throw new Error('Can only cancel batches with status "producing" or "produced"');
    }

    const updatedBatch = await productionBatchRepository.updateStatusWithHistory(batchId, 'cancelled', {
      changed_by: changedBy ?? null,
      note: 'Batch cancelled',
    });

    if (!updatedBatch) {
      throw new Error('Failed to cancel batch');
    }

    await productionPlanRepository.updateQuantities(batch.plan_id);
    await productionPlanRepository.updateAutoStatus(batch.plan_id);

    const updatedPlan = await productionPlanRepository.findById(batch.plan_id);

    return {
      batch: updatedBatch,
      plan: updatedPlan
    };
  }

  async sendToQC(batchId: number, changedBy?: number): Promise<any> {
    const batch = await productionBatchRepository.findById(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.status !== 'produced') {
      throw new Error('Can only send batches with status "produced" to QC');
    }

    const updatedBatch = await productionBatchRepository.updateStatusWithHistory(batchId, 'waiting_qc', {
      changed_by: changedBy ?? null,
      note: 'Send to QC',
    });

    if (!updatedBatch) {
      throw new Error('Failed to send batch to QC');
    }

    return updatedBatch;
  }

  async undoSendToQC(batchId: number, changedBy?: number): Promise<any> {
    const batch = await productionBatchRepository.findById(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.status !== 'waiting_qc') {
      throw new Error('Can only undo batches with status "waiting_qc"');
    }

    // Kiểm tra không có inspection record nào
    const inspections = await qualityInspectionRepository.findByBatchId(batchId);
    if (inspections.length > 0) {
      throw new Error(
        'Cannot undo send to QC after inspection has started. ' +
        'Please complete or undo the inspection first.'
      );
    }

    const updatedBatch = await productionBatchRepository.updateStatusWithHistory(batchId, 'produced', {
      changed_by: changedBy ?? null,
      note: 'Undo send to QC',
    });

    if (!updatedBatch) {
      throw new Error('Failed to undo send to QC');
    }

    return updatedBatch;
  }

  async getAllBatches(): Promise<any> {
    return await productionBatchRepository.getAllBatches();
  }

  async getBatchStatusHistory(batchId: number): Promise<any> {
    const batch = await productionBatchRepository.findById(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    return await productionBatchRepository.getStatusHistoryByBatchId(batchId);
  }
}

export default new ProductionBatchService();
