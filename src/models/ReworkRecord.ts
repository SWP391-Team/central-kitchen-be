export interface ReworkRecord {
  rework_id: number;
  rework_code: string;
  rework_no: number;
  batch_id: number;
  quality_inspection_id: number;
  rework_qty: number;
  reworkable_qty: number | null;
  non_reworkable_qty: number | null;
  status: 'Reworking' | 'Reworked' | 'Rework Failed' | 'Incorrect Data';
  note: string | null;
  rework_by: number | null;
  rework_date: string | null;
  batch_status_after_rework: string | null;
  created_by: number;
  created_at: string;
}

export interface ReworkRecordWithDetails extends ReworkRecord {
  batch_code?: string;
  product_name?: string;
  product_code?: string;
  rework_by_username?: string;
  created_by_username?: string;
}

export interface ReworkRecordCreateDto {
  batch_id: number;
  quality_inspection_id: number;
  created_by: number;
}

export interface ReworkRecordFinishDto {
  reworkable_qty: number;
  non_reworkable_qty: number;
  note?: string;
}
