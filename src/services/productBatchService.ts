import productBatchRepository from '../repositories/productBatchRepository';
import inventoryRepository from '../repositories/inventoryRepository';
import { ProductBatchCreateDto, ProductBatchWithDetails } from '../models/ProductBatch'; 

export class ProductBatchService {
  async getAllBatchesWithDetails(storeId: number = 1): Promise<ProductBatchWithDetails[]> {
    await inventoryRepository.updateExpiredStatuses();
    return await inventoryRepository.findAllWithDetails(storeId);
  }

  async getBatchesByStore(storeId: number): Promise<ProductBatchWithDetails[]> {
    await inventoryRepository.updateExpiredStatuses();
    return await inventoryRepository.findAllWithDetails(storeId);
  }

  async createBatches(batchesData: ProductBatchCreateDto[], storeId: number = 1): Promise<ProductBatchWithDetails[]> {
    for (const batchData of batchesData) {
      this.validateBatch(batchData);
    }

    const createdBatches: ProductBatchWithDetails[] = [];

    for (const batchData of batchesData) {
      const batch = await productBatchRepository.create(batchData);

      await inventoryRepository.create({
        store_id: storeId,
        batch_id: batch.batch_id,
        quantity: batchData.quantity
      });

      const batches = await inventoryRepository.findAllWithDetails(storeId);
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
}

export default new ProductBatchService();
