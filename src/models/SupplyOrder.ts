export interface SupplyOrder {
  supply_order_id: number;
  supply_order_code: string;
  store_id: number;
  status: 'SUBMITTED' | 'APPROVED' | 'PARTLY_APPROVED' | 'REJECTED' | 'DELIVERING' | 'RECEIPTED' | 'STOCKED' | 'CANCELLED';
  created_at: Date;
  created_by: number;
}

export interface SupplyOrderCreateDto {
  supply_order_code: string;
  items: {
    product_id: number;
    requested_quantity: number;
  }[];
}
