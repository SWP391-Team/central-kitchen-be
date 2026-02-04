export interface ProductBatch {
  batch_id: number;
  batch_code: string;
  product_id: number;
  production_date: Date;
  expired_date: Date;
  created_at?: Date;
}

export interface ProductBatchCreateDto {
  batch_code: string;
  product_id: number;
  production_date: Date;
  expired_date: Date;
  quantity: number; 
}

export interface ProductBatchUpdateDto {
  production_date?: Date;
  expired_date?: Date;
}

export interface ProductBatchWithDetails {
  batch_id: number;
  batch_code: string;
  product_id: number;
  product_name: string;
  unit: string;
  production_date: Date;
  expired_date: Date;
  status: string; 
  quantity: number;
  disposed_reason?: string | null; 
  disposed_at?: Date | null; 
  inventory_id?: number; 
  created_at: Date;
}
