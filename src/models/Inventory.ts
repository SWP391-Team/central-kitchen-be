export interface Inventory {
  inventory_id: number;
  store_id: number;
  batch_id: number;
  quantity: number;
  status: 'ACTIVE' | 'NEAR_EXPIRY' | 'EXPIRED' | 'DISPOSED';
  disposed_reason?: 'EXPIRED' | 'WRONG_DATA' | 'DEFECTIVE' | null;
  disposed_at?: Date | null;
  created_at?: Date;
}

export interface InventoryCreateDto {
  store_id: number;
  batch_id: number;
  quantity: number;
}

export interface InventoryUpdateDto {
  quantity?: number;
  status?: 'ACTIVE' | 'NEAR_EXPIRY' | 'EXPIRED' | 'DISPOSED';
  disposed_reason?: 'EXPIRED' | 'WRONG_DATA' | 'DEFECTIVE';
  disposed_at?: Date;
}
