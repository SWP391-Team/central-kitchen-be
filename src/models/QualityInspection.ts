export interface QualityInspection {
  quality_inspection_id: number;
  batch_id: number;
  quality_inspection_code: string;
  inspection_no: number;
  inspection_mode: 'sampling' | 'full' | null;
  inspected_qty: number | null;
  passed_qty: number | null;
  failed_qty: number | null;
  status: 'Inspecting' | 'Passed' | 'Failed' | 'Incorrect Data';
  batch_status_at_inspection: string | null;
  note: string | null;
  inspected_by: number | null;
  inspected_at: string | null;
  created_at: string;
  created_by: number;
}

export interface QualityInspectionCreateDto {
  batch_id: number;
  created_by: number;
}

export interface QualityInspectionFinishDto {
  inspection_mode: 'sampling' | 'full';
  inspected_qty: number;
  passed_qty: number;
  failed_qty: number;
  inspection_result: 'Pass' | 'Fail';
  note?: string;
}

export interface QualityInspectionWithDetails extends QualityInspection {
  batch_code?: string;
  product_name?: string;
  product_code?: string;
  produced_qty?: number;
  batch_status?: string;
  max_inspection_no?: number;
  inspected_by_username?: string;
  created_by_username?: string;
}
