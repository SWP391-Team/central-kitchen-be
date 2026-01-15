export interface Store {
  store_id: number;
  store_name: string;
  store_address: string;
  is_active: boolean;
  created_at: Date;
}

export interface StoreCreateDto {
  store_name: string;
  store_address: string;
  is_active?: boolean;
}

export interface StoreUpdateDto {
  store_name?: string;
  store_address?: string;
  is_active?: boolean;
}

export interface StoreResponse {
  store_id: number;
  store_name: string;
  store_address: string;
  is_active: boolean;
  created_at: Date;
}
