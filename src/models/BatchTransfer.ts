export type BatchTransferStatus = 'Delivering' | 'Received';

export interface BatchTransfer {
  batch_transfer_id: number;
  batch_transfer_code?: string;
  supply_order_item_id?: number | null;
  batch_id: number;
  product_id: number;
  from_location_id: number;
  to_location_id: number;
  transfer_qty: number;
  transfer_date: string;
  lost_qty: number;
  status: BatchTransferStatus;
  created_by: number;
  created_at: string;
}

export interface BatchTransferWithDetails extends BatchTransfer {
  batch_code?: string;
  batch_transfer_code?: string;
  product_name?: string;
  product_code?: string;
  unit_name?: string | null;
  from_location_name?: string;
  to_location_name?: string;
  created_by_username?: string;
  already_received_qty?: number;
}

export interface BatchTransferCreateDto {
  batch_id: number;
  transfer_qty: number;
  transfer_date: string;
  created_by: number;
  supply_order_item_id?: number;
}
