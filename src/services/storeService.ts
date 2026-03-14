import { StoreRepository } from '../repositories/storeRepository';
import { StoreCreateDto, StoreUpdateDto, StoreResponse } from '../models/Store';

export class StoreService {
  private storeRepository: StoreRepository;

  constructor() {
    this.storeRepository = new StoreRepository();
  }

  async getAllStores(params?: { search?: string; is_active?: boolean; location_type?: string }): Promise<StoreResponse[]> {
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
    const locationCodePattern = /^[A-Z][A-Z0-9_-]{2,31}$/;
    if (!storeData.location_code || !locationCodePattern.test(storeData.location_code.toUpperCase())) {
      throw new Error('Invalid location_code format. Expected 3-32 chars: A-Z, 0-9, _, -');
    }

    if (!storeData.location_type) {
      throw new Error('location_type is required');
    }

    storeData.location_code = storeData.location_code.toUpperCase();

    const existingStoreCode = await this.storeRepository.findByStoreCode(storeData.location_code);
    if (existingStoreCode) {
      throw new Error('Location code already exists');
    }

    const existingStore = await this.storeRepository.findByName(storeData.location_name);
    if (existingStore) {
      throw new Error('Location name already exists');
    }

    return await this.storeRepository.create(storeData);
  }

  async updateStore(storeId: number, storeData: StoreUpdateDto): Promise<StoreResponse> {
    if ('location_code' in (storeData as any)) {
      throw new Error('Cannot modify location_code after creation');
    }

    const store = await this.storeRepository.findById(storeId);
    if (!store) {
      throw new Error('Location not found');
    }

    if (storeData.location_name && storeData.location_name !== store.location_name) {
      const existingStore = await this.storeRepository.findByName(storeData.location_name);
      if (existingStore) {
        throw new Error('Location name already exists');
      }
    }

    const updatedStore = await this.storeRepository.update(storeId, storeData);
    if (!updatedStore) {
      throw new Error('Failed to update location');
    }
    return updatedStore;
  }

  async toggleStoreStatus(storeId: number, is_active: boolean): Promise<StoreResponse> {
    const store = await this.storeRepository.findById(storeId);
    if (!store) {
      throw new Error('Location not found');
    }

    const updatedStore = await this.storeRepository.updateStatus(storeId, is_active);
    if (!updatedStore) {
      throw new Error('Failed to update location status');
    }
    return updatedStore;
  }

  async deleteStore(storeId: number): Promise<void> {
    const store = await this.storeRepository.findById(storeId);
    if (!store) {
      throw new Error('Location not found');
    }

    const hasUsers = await this.storeRepository.hasUsers(storeId);
    if (hasUsers) {
      throw new Error('Cannot delete location with assigned users. Please reassign or remove users first.');
    }

    await this.storeRepository.delete(storeId);
  }
}
