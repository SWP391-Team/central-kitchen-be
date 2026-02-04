export interface User {
  user_id: number;
  user_code: string;
  username: string;
  password: string;
  role_id: number;
  store_id: number | null;
  is_active: boolean;
  created_at: Date;
  updated_at?: Date;
}

export interface UserCreateDto {
  user_code: string;
  username: string;
  password: string;
  role_id: number;
  store_id?: number | null;
  is_active?: boolean;
}

export interface UserUpdateDto {
  username?: string;
  password?: string;
  role_id?: number;
  store_id?: number | null;
  is_active?: boolean;
}

export interface UserResponse {
  user_id: number;
  user_code: string;
  username: string;
  role_id: number;
  store_id: number | null;
  is_active: boolean;
  created_at: Date;
  updated_at?: Date;
}
