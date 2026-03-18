import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserRepository } from '../repositories/userRepository';
import { LocationRepository } from '../repositories/locationRepository';

export interface LoginDto {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    user_id: number;
    user_code: string;
    username: string;
    role_id: number;
    location_id: number | null;
    location_ids: number[];
  };
}

export class AuthService {
  private userRepository: UserRepository;
  private locationRepository: LocationRepository;
  private jwtSecret: string;

  constructor() {
    this.userRepository = new UserRepository();
    this.locationRepository = new LocationRepository();
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

    const locationIds = (user.location_ids && user.location_ids.length > 0)
      ? user.location_ids
      : (user.location_id !== null ? [user.location_id] : []);
    for (const locationId of locationIds) {
      const location = await this.locationRepository.findById(locationId);
      if (!location || !location.is_active) {
        throw new Error('One of your assigned locations is inactive. Please contact administrator.');
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
        location_id: user.location_id,
        location_ids: locationIds,
      },
      this.jwtSecret,
      { expiresIn: '24h' }
    );

    return {
      token,
      user: {
        user_id: user.user_id,
        user_code: user.user_code,
        username: user.username,
        role_id: user.role_id,
        location_id: user.location_id,
        location_ids: locationIds,
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
