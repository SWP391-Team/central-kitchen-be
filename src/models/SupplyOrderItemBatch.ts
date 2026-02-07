export interface SupplyOrderItemBatch {
  item_batch_id: number;
  supply_order_item_id: number;
  batch_id: number;
  inventory_id: number;
  quantity: number; 
  receipted_quantity: number | null;
  stocked_quantity: number | null;
  created_at: Date;
  
  batch_code?: string;
  product_name?: string;
}

export interface CreateSupplyOrderItemBatchRequest {
  supply_order_item_id: number;
  batch_id: number;
  inventory_id: number;
  quantity: number;
}

export interface UpdateReceiptedQuantityRequest {
  item_batch_id: number;
  receipted_quantity: number;
}

export interface UpdateStockedQuantityRequest {
  item_batch_id: number;
  stocked_quantity: number;
}
