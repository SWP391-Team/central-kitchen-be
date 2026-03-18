export type LocationType = 'CK_PRODUCTION' | 'CK_WAREHOUSE' | 'STORE';

export interface Location {
  location_id: number;
  location_code: string;
  location_name: string;
  location_address: string;
  location_type: LocationType;
  is_active: boolean;
  created_by: number | null;
  created_at: Date;
  updated_at?: Date;
}

export interface LocationCreateDto {
  location_code: string;
  location_name: string;
  location_address: string;
  location_type: LocationType;
  is_active?: boolean;
  created_by: number;
}

export interface LocationUpdateDto {
  location_name?: string;
  location_address?: string;
  location_type?: LocationType;
  is_active?: boolean;
}

export interface LocationResponse {
  location_id: number;
  location_code: string;
  location_name: string;
  location_address: string;
  location_type: LocationType;
  is_active: boolean;
  created_by: number | null;
  created_at: Date;
  updated_at?: Date;
}
