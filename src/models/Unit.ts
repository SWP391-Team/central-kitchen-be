export interface Unit {
  unit_id: number;
  unit_code: string;
  unit_name: string;
  is_active: boolean;
  created_by: number | null;
  updated_by: number | null;
  created_by_username?: string | null;
  updated_by_username?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface UnitCreateDto {
  unit_name: string;
}

export interface UnitUpdateDto {
  unit_name?: string;
}
