import inventoryRepository from '../repositories/inventoryRepository';
import { ProductBatchWithDetails } from '../models/ProductBatch';

export class InventoryService {
  async getInventoryByStore(storeId: number): Promise<ProductBatchWithDetails[]> {
    await inventoryRepository.updateExpiredStatuses();
    
    return await inventoryRepository.findAllWithDetails(storeId);
  }

  async disposeInventory(inventoryId: number, disposedReason: string): Promise<void> {
    const inventory = await inventoryRepository.findById(inventoryId);
    
    if (!inventory) {
      throw new Error('Inventory not found');
    }

    if (inventory.status === 'DISPOSED') {
      throw new Error('Inventory is already disposed');
    }

    const validReasons = ['EXPIRED', 'WRONG_DATA', 'DEFECTIVE'];
    if (!validReasons.includes(disposedReason)) {
      throw new Error('Invalid disposed reason');
    }

    let finalReason = disposedReason;
    if (inventory.status === 'EXPIRED') {
      finalReason = 'EXPIRED';
    }

    await inventoryRepository.updateStatus(inventoryId, 'DISPOSED', finalReason);
  }

  async updateAllInventoryStatuses(): Promise<void> {
    await inventoryRepository.updateExpiredStatuses();
  }

  async getCentralKitchenInventory(): Promise<ProductBatchWithDetails[]> {
    return this.getInventoryByStore(1);
  }

  async getStoreDistrict1Inventory(): Promise<ProductBatchWithDetails[]> {
    return this.getInventoryByStore(2);
  }

  async getStoreDistrict2Inventory(): Promise<ProductBatchWithDetails[]> {
    return this.getInventoryByStore(3);
  }
}

export default new InventoryService();
