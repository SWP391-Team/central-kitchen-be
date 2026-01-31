export interface SupplyOrderItem {
  supply_order_item_id: number;
  supply_order_id: number;
  product_id: number;
  requested_quantity: number;
  approved_quantity: number | null;
  status: string; 
}

export interface SupplyOrderItemCreateDto {
  supply_order_id: number;
  product_id: number;
  requested_quantity: number;
}
