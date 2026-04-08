export type SupplyOrderStatus =
  | 'Draft'
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Partly Delivered'
  | 'Delivered'
  | 'Closed';

export type SupplyOrderItemStatus = 'Draft' | 'Pending' | 'Approved' | 'Rejected';
export type SupplyOrderPriority = 'LOW' | 'NORMAL' | 'URGENT';
export type SupplyOrderSourceType = 'MANUAL' | 'REORDER';
export type SupplyOrderShortageReason =
  | 'OUT_OF_STOCK'
  | 'LOW_STOCK'
  | 'QUALITY_ISSUE'
  | 'OTHER';

export interface SupplyOrder {
  supply_order_id: number;
  supply_order_code: string;
  location_id: number;
  status: SupplyOrderStatus;
  requested_by: number;
  approved_by: number | null;
  approved_at: string | null;
  first_delivery_at?: string | null;
  order_date?: string | null;
  need_by_date?: string | null;
  submitted_at?: string | null;
  submitted_by?: number | null;
  completed_at?: string | null;
  priority?: SupplyOrderPriority;
  source_type?: SupplyOrderSourceType;
  reorder_from_order_id?: number | null;
  note: string | null;
  closed_by?: number | null;
  closed_at?: string | null;
  close_reason?: string | null;
  close_note?: string | null;
  created_by: number;
  created_at: string;
}

export interface SupplyOrderItem {
  supply_order_item_id: number;
  supply_order_id: number;
  product_id: number;
  requested_qty: number;
  delivered_qty: number;
  approved_qty: number;
  status: SupplyOrderItemStatus;
  need_by_date_item?: string | null;
  expected_delivery_date?: string | null;
  shortage_reason?: SupplyOrderShortageReason | null;
}

export interface SupplyOrderWithDetails extends SupplyOrder {
  requested_by_username?: string;
  requested_by_user_code?: string;
  location_name?: string;
  location_code?: string;
  location_type?: string;
  created_by_username?: string;
  approved_by_username?: string;
  submitted_by_username?: string;
  reorder_from_order_code?: string | null;
  closed_by_username?: string;
  item_count?: number;
}

export interface SupplyOrderItemWithDetails extends SupplyOrderItem {
  product_name?: string;
  product_code?: string;
  unit?: string;
  remaining_qty?: number;
}

export interface CkInventoryRow {
  location_id: number;
  location_name: string;
  product_id: number;
  product_code: string;
  product_name: string;
  unit: string;
  batch_id: number;
  batch_code: string;
  production_date?: string | null;
  expired_date?: string | null;
  qty_on_hand: number;
  qty_available: number;
  updated_at: string;
}

export interface RequesterSuggestion {
  user_id: number;
  username: string;
  user_code: string;
}

export interface CreateSupplyOrderDto {
  requested_by_user_id?: number;
  requested_by?: string;
  order_date?: string;
  need_by_date?: string;
  priority?: SupplyOrderPriority;
  source_type?: SupplyOrderSourceType;
  reorder_from_order_id?: number;
  note?: string;
  items: Array<{
    product_id: number;
    requested_qty: number;
    need_by_date_item?: string;
    expected_delivery_date?: string;
  }>;
  location_id?: number;
}

export interface ApproveSupplyOrderDto {
  note?: string;
  items: Array<{
    supply_order_item_id: number;
    approved_qty: number;
    expected_delivery_date?: string;
    shortage_reason?: SupplyOrderShortageReason;
  }>;
}

export interface CreateSupplyOrderDeliveryDto {
  batch_id: number;
  location_id: number;
  transfer_qty: number;
  transfer_date: string;
}

export interface CloseSupplyOrderDto {
  close_reason: 'Out of stock' | 'Production issue' | 'No longer needed' | 'Other';
  close_note?: string;
}
