export interface WarehouseReceive {
  warehouse_receive_id: number;
  warehouse_receive_code?: string;
  batch_transfer_id: number;
  batch_id: number;
  location_id: number;
  received_qty: number;
  received_date: string;
  received_by: number;
  created_by: number;
  created_at: string;
  status: 'Received';
  is_over_delivery: boolean;
}

export interface WarehouseReceiveWithDetails extends WarehouseReceive {
  batch_code?: string;
  warehouse_receive_code?: string;
  product_name?: string;
  product_code?: string;
  location_name?: string;
  received_by_username?: string;
  created_by_username?: string;
}

export interface WarehouseReceiveCreateDto {
  batch_transfer_id: number;
  received_qty: number;
  received_date: string;
  received_by: number;
  created_by: number;
}
