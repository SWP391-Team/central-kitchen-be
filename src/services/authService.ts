import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserRepository } from '../repositories/userRepository';
import { StoreRepository } from '../repositories/storeRepository';

export interface LoginDto {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    user_id: number;
    username: string;
    role_id: number;
    store_id: number | null;
  };
}

export class AuthService {
  private userRepository: UserRepository;
  private storeRepository: StoreRepository;
  private jwtSecret: string;

  constructor() {
    this.userRepository = new UserRepository();
    this.storeRepository = new StoreRepository();
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
  }

  async login(loginData: LoginDto): Promise<AuthResponse> {
    const { username, password } = loginData;

    const user = await this.userRepository.findByUsername(username);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (!user.is_active) {
      throw new Error('User account is inactive');
    }

    if (user.store_id !== null) {
      const store = await this.storeRepository.findById(user.store_id);
      if (!store || !store.is_active) {
        throw new Error('Your store is inactive. Please contact administrator.');
      }
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
        role_id: user.role_id,
        store_id: user.store_id,
      },
      this.jwtSecret,
      { expiresIn: '24h' }
    );

    return {
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        role_id: user.role_id,
        store_id: user.store_id,
      },
    };
  }

  verifyToken(token: string): any {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }
}
