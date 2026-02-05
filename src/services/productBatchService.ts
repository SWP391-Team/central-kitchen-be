import productBatchRepository from '../repositories/productBatchRepository';
import inventoryRepository from '../repositories/inventoryRepository';
import { ProductBatchCreateDto, ProductBatchWithDetails, ProductBatch } from '../models/ProductBatch';

export class ProductBatchService {
  async getAllBatchesWithDetails(storeId: number = 1): Promise<ProductBatchWithDetails[]> {
    await inventoryRepository.updateExpiredStatuses();
    return await inventoryRepository.findAllWithDetails(storeId);
  }

  async getBatchesByStore(storeId: number): Promise<ProductBatchWithDetails[]> {
    await inventoryRepository.updateExpiredStatuses();
    return await inventoryRepository.findAllWithDetails(storeId);
  }

  async createBatchPlans(batchesData: ProductBatchCreateDto[]): Promise<ProductBatch[]> {
    const batchCodes = batchesData.map(b => b.batch_code.toUpperCase());
    const duplicates = batchCodes.filter((code, index) => batchCodes.indexOf(code) !== index);
    if (duplicates.length > 0) {
      throw new Error(`Duplicate batch codes in request: ${duplicates.join(', ')}`);
    }

    for (const batchData of batchesData) {
      await this.validateBatchPlan(batchData);
    }

    const createdBatches: ProductBatch[] = [];

    for (const batchData of batchesData) {
      const batch = await productBatchRepository.create(batchData);
      createdBatches.push(batch);
    }

    return createdBatches;
  }

  async produceBatch(batchId: number, producedQuantity: number, productionDate: Date, expiredDate: Date): Promise<ProductBatch> {
    const batch = await productBatchRepository.findById(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.status !== 'PLANNED') {
      throw new Error('Only PLANNED batches can be produced');
    }

    if (producedQuantity <= 0 || producedQuantity > batch.planned_quantity) {
      throw new Error(`Produced quantity must be between 1 and ${batch.planned_quantity}`);
    }

    const prodDate = new Date(productionDate);
    const expDate = new Date(expiredDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    prodDate.setHours(0, 0, 0, 0);
    expDate.setHours(0, 0, 0, 0);

    if (prodDate > today) {
      throw new Error('Production date cannot be in the future');
    }

    if (expDate <= today) {
      throw new Error('Expired date must be after today');
    }

    if (expDate <= prodDate) {
      throw new Error('Expired date must be after production date');
    }

    const updatedBatch = await productBatchRepository.update(batchId, {
      produced_quantity: producedQuantity,
      production_date: productionDate,
      expired_date: expiredDate,
      status: 'PRODUCED'
    });

    if (!updatedBatch) {
      throw new Error('Failed to update batch');
    }

    return updatedBatch;
  }

  async stockBatch(batchId: number, stockedQuantity: number): Promise<ProductBatch> {
    const batch = await productBatchRepository.findById(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.status !== 'PRODUCED') {
      throw new Error('Only PRODUCED batches can be stocked');
    }

    if (!batch.produced_quantity || stockedQuantity <= 0 || stockedQuantity > batch.produced_quantity) {
      throw new Error(`Stocked quantity must be between 1 and ${batch.produced_quantity}`);
    }

    const existingInventory = await inventoryRepository.findByStoreAndBatch(1, batchId);
    if (existingInventory) {
      throw new Error('Batch has already been stocked');
    }

    await inventoryRepository.create({
      store_id: 1, 
      batch_id: batchId,
      quantity: stockedQuantity
    });

    const updatedBatch = await productBatchRepository.update(batchId, {
      status: 'STOCKED'
    });

    if (!updatedBatch) {
      throw new Error('Failed to update batch');
    }

    return updatedBatch;
  }

  async cancelBatch(batchId: number): Promise<ProductBatch> {
    const batch = await productBatchRepository.findById(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.status !== 'PLANNED' && batch.status !== 'PRODUCED') {
      throw new Error('Only PLANNED or PRODUCED batches can be cancelled');
    }

    const updatedBatch = await productBatchRepository.update(batchId, {
      status: 'CANCELLED'
    });

    if (!updatedBatch) {
      throw new Error('Failed to update batch');
    }

    return updatedBatch;
  }

  async getAllBatchPlans(): Promise<any[]> {
    const query = `
      SELECT 
        pb.batch_id,
        pb.batch_code,
        pb.product_id,
        pb.status,
        pb.planned_quantity,
        pb.produced_quantity,
        pb.production_date,
        pb.expired_date,
        pb.created_at,
        p.product_name,
        p.unit
      FROM product_batch pb
      JOIN product p ON pb.product_id = p.product_id
      ORDER BY pb.created_at DESC
    `;
    
    const pool = require('../config/database').default;
    const result = await pool.query(query);
    return result.rows;
  }

  private async validateBatchPlan(batchData: ProductBatchCreateDto): Promise<void> {
    if (!batchData.batch_code) {
      throw new Error('Batch code is required');
    }

    const batchCodeRegex = /^BATCH-\d{6}-[A-Z0-9]{3}$/;
    const upperBatchCode = batchData.batch_code.toUpperCase();

    if (!batchCodeRegex.test(upperBatchCode)) {
      throw new Error('Batch code must follow format: BATCH-YYYYMM-XXX');
    }

    batchData.batch_code = upperBatchCode;

    const existingBatch = await productBatchRepository.findByBatchCode(upperBatchCode);
    if (existingBatch) {
      throw new Error(`Batch code ${upperBatchCode} already exists`);
    }

    if (!batchData.planned_quantity || batchData.planned_quantity <= 0) {
      throw new Error('Planned quantity must be greater than 0');
    }

    if (!Number.isInteger(batchData.planned_quantity)) {
      throw new Error('Planned quantity must be an integer');
    }
  }

  private async validateBatch(batchData: ProductBatchCreateDto): Promise<void> {
    if (!batchData.batch_code) {
      throw new Error('Batch code is required');
    }

    const batchCodeRegex = /^BATCH-\d{6}-[A-Z0-9]{3}$/;
    const upperBatchCode = batchData.batch_code.toUpperCase();

    if (!batchCodeRegex.test(upperBatchCode)) {
      throw new Error('Batch code must follow format: BATCH-YYYYMM-XXX');
    }

    batchData.batch_code = upperBatchCode;

    const existingBatch = await productBatchRepository.findByBatchCode(upperBatchCode);
    if (existingBatch) {
      throw new Error(`Batch code ${upperBatchCode} already exists`);
    }

    if (!batchData.planned_quantity || batchData.planned_quantity <= 0) {
      throw new Error('Quantity must be greater than 0');
    }

    if (!Number.isInteger(batchData.planned_quantity)) {
      throw new Error('Quantity must be an integer');
    }
  }
}

export default new ProductBatchService();
