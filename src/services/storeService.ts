import { StoreRepository } from '../repositories/storeRepository';
import { StoreCreateDto, StoreUpdateDto, StoreResponse } from '../models/Store';

export class StoreService {
  private storeRepository: StoreRepository;

  constructor() {
    this.storeRepository = new StoreRepository();
  }

  async getAllStores(params?: { search?: string; is_active?: boolean }): Promise<StoreResponse[]> {
    return await this.storeRepository.findAll(params);
  }

  async getStoreById(storeId: number): Promise<StoreResponse> {
    const store = await this.storeRepository.findById(storeId);
    if (!store) {
      throw new Error('Store not found');
    }
    return store;
  }

  async createStore(storeData: StoreCreateDto): Promise<StoreResponse> {
    const storeCodePattern = /^ST-[A-Z0-9]{3}-[A-Z0-9]{4}$/;
    if (!storeData.store_code || !storeCodePattern.test(storeData.store_code.toUpperCase())) {
      throw new Error('Invalid store_code format. Expected format: ST-XXX-XXXX');
    }

    storeData.store_code = storeData.store_code.toUpperCase();

    const existingStoreCode = await this.storeRepository.findByStoreCode(storeData.store_code);
    if (existingStoreCode) {
      throw new Error('Store code already exists');
    }

    const existingStore = await this.storeRepository.findByName(storeData.store_name);
    if (existingStore) {
      throw new Error('Store name already exists');
    }

    return await this.storeRepository.create(storeData);
  }

  async updateStore(storeId: number, storeData: StoreUpdateDto): Promise<StoreResponse> {
    if ('store_code' in storeData) {
      throw new Error('Cannot modify store_code after creation');
    }

    const store = await this.storeRepository.findById(storeId);
    if (!store) {
      throw new Error('Store not found');
    }

    if (storeData.store_name && storeData.store_name !== store.store_name) {
      const existingStore = await this.storeRepository.findByName(storeData.store_name);
      if (existingStore) {
        throw new Error('Store name already exists');
      }
    }

    const updatedStore = await this.storeRepository.update(storeId, storeData);
    if (!updatedStore) {
      throw new Error('Failed to update store');
    }
    return updatedStore;
  }

  async toggleStoreStatus(storeId: number, is_active: boolean): Promise<StoreResponse> {
    const store = await this.storeRepository.findById(storeId);
    if (!store) {
      throw new Error('Store not found');
    }

    const updatedStore = await this.storeRepository.updateStatus(storeId, is_active);
    if (!updatedStore) {
      throw new Error('Failed to update store status');
    }
    return updatedStore;
  }

  async deleteStore(storeId: number): Promise<void> {
    const store = await this.storeRepository.findById(storeId);
    if (!store) {
      throw new Error('Store not found');
    }

    const hasUsers = await this.storeRepository.hasUsers(storeId);
    if (hasUsers) {
      throw new Error('Cannot delete store with assigned users. Please reassign or remove users first.');
    }

    await this.storeRepository.delete(storeId);
  }
}
