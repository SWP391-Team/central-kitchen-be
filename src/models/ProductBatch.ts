export interface ProductBatch {
  batch_id: number;
  batch_code: string;
  product_id: number;
  production_date?: Date | null;
  expired_date?: Date | null;
  status: 'PLANNED' | 'PRODUCED' | 'STOCKED' | 'CANCELLED';
  planned_quantity: number;
  produced_quantity?: number | null;
  created_at?: Date;
}

export interface ProductBatchCreateDto {
  batch_code: string;
  product_id: number;
  planned_quantity: number;
}

export interface ProductBatchUpdateDto {
  production_date?: Date;
  expired_date?: Date;
  status?: 'PLANNED' | 'PRODUCED' | 'STOCKED' | 'CANCELLED';
  produced_quantity?: number;
}

export interface ProductBatchWithDetails {
  batch_id: number;
  batch_code: string;
  product_id: number;
  product_name: string;
  unit: string;
  production_date?: Date | null;
  expired_date?: Date | null;
  status: 'PLANNED' | 'PRODUCED' | 'STOCKED' | 'CANCELLED';
  planned_quantity: number;
  produced_quantity?: number | null;
  inventory_id?: number;
  inventory_quantity?: number;
  inventory_status?: string;
  created_at: Date;
}
