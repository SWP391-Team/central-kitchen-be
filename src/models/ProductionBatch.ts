export interface ProductionBatch {
  batch_id: number;
  plan_id: number;
  batch_code: string;
  product_id: number;
  produced_qty: number | null;
  production_date: string | null;
  expired_date: string | null;
  status: 'producing' | 'produced' | 'waiting_qc' | 'under_qc' | 'qc_passed' | 'qc_failed' | 'rejected' | 'cancelled' | 'rework_required' | 'reworking' | 'reworked' | 'rework_failed' | 'delivering' | 'delivered' | 'received';
  created_at: string;
  created_by: number;
  good_qty: number | null;
  defect_qty: number | null;
}

export interface ProductionBatchCreateDto {
  plan_id: number;
  product_id: number;
  created_by: number;
}

export interface ProductionBatchFinishDto {
  produced_qty: number;
  production_date: string;
  expired_date: string;
}

export interface ProductionBatchWithDetails extends ProductionBatch {
  plan_code?: string;
  product_name?: string;
  product_code?: string;
  created_by_username?: string;
}
