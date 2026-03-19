export interface BatchInventory {
  batch_inventory_id: number;
  location_id: number;
  product_id: number;
  batch_id: number;
  qty_on_hand: number;
  qty_reserved: number;
  qty_available: number;
  updated_at: string;
}

export interface BatchInventoryWithDetails extends BatchInventory {
  location_name?: string;
  product_name?: string;
  product_code?: string;
  batch_code?: string;
  production_date?: string | null;
  expired_date?: string | null;
}
