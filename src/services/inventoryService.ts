import inventoryRepository from '../repositories/inventoryRepository';
import { BatchInventoryWithDetails } from '../models/BatchInventory';
import { InventoryTransactionWithDetails } from '../models/InventoryTransaction';

export class InventoryService {

  async getBatchInventory(
    locationIds?: number[]
  ): Promise<BatchInventoryWithDetails[]> {
    return inventoryRepository.findAllBatchInventory(locationIds);
  }

  async getInventoryTransactions(
    locationIds?: number[]
  ): Promise<InventoryTransactionWithDetails[]> {
    return inventoryRepository.findAllTransactions(locationIds);
  }
}

export default new InventoryService();
