import productionBatchRepository from '../repositories/productionBatchRepository';
import productionPlanRepository from '../repositories/productionPlanRepository';
import qualityInspectionRepository from '../repositories/qualityInspectionRepository';
import { ProductRepository } from '../repositories/productRepository';
import { ProductionBatchCreateDto, ProductionBatchFinishDto } from '../models/ProductionBatch';

const productRepository = new ProductRepository();

export class ProductionBatchService {
  async createBatch(batchData: ProductionBatchCreateDto): Promise<any> {
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
