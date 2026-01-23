export interface Inventory {
  inventory_id: number;
  store_id: number;
  batch_id: number;
  quantity: number;
  created_at?: Date;
}

export interface InventoryCreateDto {
  store_id: number;
  batch_id: number;
  quantity: number;
}

export interface InventoryUpdateDto {
  quantity?: number;
}
