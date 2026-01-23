export interface ProductBatch {
  batch_id: number;
  product_id: number;
  production_date: Date;
  expired_date: Date;
  status: 'ACTIVE' | 'NEAR_EXPIRY' | 'EXPIRED' | 'DISPOSED';
  disposed_reason?: 'EXPIRED' | 'WRONG_DATA' | 'DEFECTIVE' | null;
  disposed_at?: Date | null;
  created_at?: Date;
}

export interface ProductBatchCreateDto {
  product_id: number;
  production_date: Date;
  expired_date: Date;
  quantity: number; 
}

export interface ProductBatchUpdateDto {
  status?: 'ACTIVE' | 'NEAR_EXPIRY' | 'EXPIRED' | 'DISPOSED';
  disposed_reason?: 'EXPIRED' | 'WRONG_DATA' | 'DEFECTIVE';
  disposed_at?: Date;
}

export interface ProductBatchWithDetails {
  batch_id: number;
  product_id: number;
  product_name: string;
  unit: string;
  production_date: Date;
  expired_date: Date;
  status: string;
  quantity: number;
  disposed_reason?: string | null;
  disposed_at?: Date | null;
  created_at: Date;
}
