export interface SupplyOrder {
  supply_order_id: number;
  store_id: number;
  status: 'SUBMITTED' | 'APPROVED' | 'PARTLY_APPROVED' | 'REJECTED' | 'DELIVERING' | 'DELIVERED';
  created_at: Date;
  created_by: number;
}

export interface SupplyOrderCreateDto {
  items: {
    product_id: number;
    requested_quantity: number;
  }[];
}
