export type TransactionType = 'IN' | 'OUT' | 'ADJUSTMENT';
export type ReferenceType =
  | 'production_batch'
  | 'batch_transfer'
  | 'warehouse_receive'
  | 'inventory_adjustment';

export interface InventoryTransaction {
  inventory_transaction_id: number;
  location_id: number;
  product_id: number;
  batch_id: number;
  reference_type: ReferenceType;
  reference_id: number;
  qty: number;
  transaction_type: TransactionType;
  created_at: string;
}

export interface InventoryTransactionWithDetails extends InventoryTransaction {
  location_name?: string;
  product_name?: string;
  product_code?: string;
  unit_name?: string | null;
  batch_code?: string;
}
