export type LocationType = 'CK_PRODUCTION' | 'CK_WAREHOUSE' | 'STORE';

export interface Store {
  location_id: number;
  location_code: string;
  location_name: string;
  location_address: string;
  location_type: LocationType;
  is_active: boolean;
  created_at: Date;
  updated_at?: Date;
}

export interface StoreCreateDto {
  location_code: string;
  location_name: string;
  location_address: string;
  location_type: LocationType;
  is_active?: boolean;
}

export interface StoreUpdateDto {
  location_name?: string;
  location_address?: string;
  location_type?: LocationType;
  is_active?: boolean;
}

export interface StoreResponse {
  location_id: number;
  location_code: string;
  location_name: string;
  location_address: string;
  location_type: LocationType;
  is_active: boolean;
  created_at: Date;
  updated_at?: Date;
}
