export type ReserveProductStatus =
  | 'OPEN'
  | 'PARTIAL'
  | 'FULFILLED'
  | 'RELEASED'
  | 'CLOSED';

export type ReserveBatchStatus = 'PARTIAL' | 'FULFILLED' | 'RELEASED';

export type ReserveHistoryEventType =
  | 'APPROVE_CREATE'
  | 'APPROVE_UPDATE'
  | 'BATCH_ALLOCATE'
  | 'BATCH_CONSUME'
  | 'PRODUCT_CONSUME'
  | 'BATCH_RELEASE'
  | 'PRODUCT_RELEASE'
  | 'AUTO_CLOSE';

export interface ReserveProductRecord {
  reserve_id: number;
  reserve_code?: string;
  supply_order_item_id: number;
  supply_order_id: number;
  product_id: number;
  location_id: number;
  approved_qty: number;
  consumed_qty: number;
  released_qty: number;
  status: ReserveProductStatus;
  created_by: number;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  remaining_qty?: number;
  supply_order_code?: string;
  product_code?: string;
  product_name?: string;
  unit_name?: string | null;
  location_name?: string;
  allocated_remaining_qty?: number;
  allocation_level?: 'NONE' | 'PARTIAL' | 'FULL';
}

export interface ReserveBatchRecord {
  reserve_batch_id: number;
  reserve_batch_code?: string;
  reserve_id: number;
  reserve_code?: string;
  supply_order_item_id: number;
  supply_order_id: number;
  product_id: number;
  batch_id: number;
  location_id: number;
  allocated_qty: number;
  consumed_qty: number;
  released_qty: number;
  status: ReserveBatchStatus;
  created_by: number;
  created_at: string;
  updated_at: string;
  remaining_qty?: number;
  supply_order_code?: string;
  product_code?: string;
  product_name?: string;
  unit_name?: string | null;
  batch_code?: string;
  location_name?: string;
}

export interface ReserveHistoryRecord {
  reserve_history_id: number;
  reserve_id: number;
  reserve_code?: string;
  reserve_batch_id?: number | null;
  reserve_batch_code?: string;
  event_type: ReserveHistoryEventType;
  qty_change: number;
  ref_type?: string | null;
  ref_id?: number | null;
  note?: string | null;
  created_by?: number | null;
  created_at: string;
  supply_order_code?: string;
  product_code?: string;
  product_name?: string;
  batch_code?: string;
  location_name?: string;
}

export interface ReserveBatchAllocationDto {
  batch_id: number;
  location_id: number;
  allocate_qty: number;
}
