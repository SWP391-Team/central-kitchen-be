import productBatchRepository from '../repositories/productBatchRepository';
import inventoryRepository from '../repositories/inventoryRepository';
import { ProductBatchCreateDto, ProductBatchWithDetails } from '../models/ProductBatch';

const CENTRAL_KITCHEN_STORE_ID = 1; 

export class ProductBatchService {
  async getAllBatchesWithDetails(): Promise<ProductBatchWithDetails[]> {
    await productBatchRepository.updateExpiredStatuses();
    return await productBatchRepository.findAllWithDetails();
  }

  async createBatches(batchesData: ProductBatchCreateDto[]): Promise<ProductBatchWithDetails[]> {
    for (const batchData of batchesData) {
      this.validateBatch(batchData);
    }

    const createdBatches: ProductBatchWithDetails[] = [];

    for (const batchData of batchesData) {
      const batch = await productBatchRepository.create(batchData);

      await inventoryRepository.create({
        store_id: CENTRAL_KITCHEN_STORE_ID,
        batch_id: batch.batch_id,
        quantity: batchData.quantity
      });

      const batches = await productBatchRepository.findAllWithDetails();
      const createdBatch = batches.find(b => b.batch_id === batch.batch_id);
      
      if (createdBatch) {
        createdBatches.push(createdBatch);
      }
    }

    return createdBatches;
  }

  private validateBatch(batchData: ProductBatchCreateDto): void {
    if (!batchData.quantity || batchData.quantity <= 0) {
      throw new Error('Quantity must be greater than 0');
    }

    const productionDate = new Date(batchData.production_date);
    const expiredDate = new Date(batchData.expired_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    expiredDate.setHours(0, 0, 0, 0);
    if (expiredDate <= today) {
      throw new Error('Expired date must be after today');
    }

    if (expiredDate <= productionDate) {
      throw new Error('Expired date must be after production date');
    }
  }

  async disposeBatch(batchId: number, disposedReason: string): Promise<void> {
    const batch = await productBatchRepository.findById(batchId);
    
    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.status === 'DISPOSED') {
      throw new Error('Batch is already disposed');
    }

    const validReasons = ['EXPIRED', 'WRONG_DATA', 'DEFECTIVE'];
    if (!validReasons.includes(disposedReason)) {
      throw new Error('Invalid disposed reason');
    }

    let finalReason = disposedReason;
    if (batch.status === 'EXPIRED') {
      finalReason = 'EXPIRED';
    }

    await productBatchRepository.updateStatus(batchId, 'DISPOSED', finalReason);
  }

  async updateBatchStatuses(): Promise<void> {
    await productBatchRepository.updateExpiredStatuses();
  }
}

export default new ProductBatchService();
