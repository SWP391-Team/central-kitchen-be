export interface ProductionBatch {
  batch_id: number;
  plan_id: number;
  batch_code: string;
  product_id: number;
  produced_by: number;
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
  produced_by: number;
  created_by: number;
}

export interface ProductionBatchFinishDto {
  produced_qty: number;
  production_date: string;
  expired_date: string;
  changed_by?: number;
}

export interface ProductionBatchWithDetails extends ProductionBatch {
  plan_code?: string;
  product_name?: string;
  product_code?: string;
  unit_name?: string | null;
  created_by_username?: string;
  produced_by_username?: string;
}

export interface ProducedBySuggestion {
  user_id: number;
  user_code: string;
  username: string;
}

export interface BatchStatusHistory {
  batch_status_history_id: number;
  batch_id: number;
  old_status: string | null;
  new_status: string;
  changed_by: number | null;
  changed_at: string;
  note: string | null;
  changed_by_username?: string;
}
