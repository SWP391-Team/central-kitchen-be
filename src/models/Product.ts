export interface Product {
  product_id: number;
  product_code: string;
  product_name: string;
  unit: string;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface ProductCreateDto {
  product_code: string;
  product_name: string;
  unit: string;
}

export interface ProductUpdateDto {
  product_name?: string;
  unit?: string;
}

export interface ProductResponse {
  product_id: number;
  product_code: string;
  product_name: string;
  unit: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
