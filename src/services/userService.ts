import bcrypt from 'bcrypt';
import { UserRepository } from '../repositories/userRepository';
import { UserCreateDto, UserUpdateDto, UserResponse } from '../models/User';

export class UserService {
  private userRepository: UserRepository;

  private normalizeLocationIds(locationIds?: number[]): number[] {
    if (!locationIds) {
      return [];
    }

    return Array.from(new Set(locationIds)).filter((id) => Number.isInteger(id) && id > 0);
  }

  constructor() {
    this.userRepository = new UserRepository();
  }

  async getAllUsers(): Promise<UserResponse[]> {
    const users = await this.userRepository.findAll();
    return users.map(this.toUserResponse);
  }

  async getUserById(userId: number): Promise<UserResponse | null> {
    const user = await this.userRepository.findById(userId);
    return user ? this.toUserResponse(user) : null;
  }

  async createUser(userData: UserCreateDto): Promise<UserResponse> {
    const userCodePattern = /^USR-\d{4}$/;
    if (!userData.user_code || !userCodePattern.test(userData.user_code.toUpperCase())) {
      throw new Error('Invalid user_code format. Expected format: USR-XXXX');
    }

    userData.user_code = userData.user_code.toUpperCase();

    const existingUserCode = await this.userRepository.findByUserCode(userData.user_code);
    if (existingUserCode) {
      throw new Error('User code already exists');
    }

    const existingUser = await this.userRepository.findByUsername(userData.username);
    if (existingUser) {
      throw new Error('Username already exists');
    }

    const normalizedLocationIds = this.normalizeLocationIds(
      userData.location_ids ?? (userData.location_id !== undefined && userData.location_id !== null ? [userData.location_id] : [])
    );

    const hashedPassword = await bcrypt.hash(userData.password, 10);

    const user = await this.userRepository.create({
      ...userData,
      password: hashedPassword,
      location_ids: normalizedLocationIds,
      location_id: normalizedLocationIds[0] ?? null,
    });

    return this.toUserResponse(user);
  }

  async updateUser(userId: number, userData: UserUpdateDto): Promise<UserResponse | null> {
    if ('user_code' in userData) {
      throw new Error('Cannot modify user_code after creation');
    }

    if (userData.username) {
      const existingUser = await this.userRepository.findByUsername(userData.username);
      if (existingUser && existingUser.user_id !== userId) {
        throw new Error('Username already exists');
      }
    }

    if (userData.password) {
      userData.password = await bcrypt.hash(userData.password, 10);
    }

    if (userData.location_ids !== undefined) {
      const normalizedLocationIds = this.normalizeLocationIds(userData.location_ids);
      userData.location_ids = normalizedLocationIds;
      userData.location_id = normalizedLocationIds[0] ?? null;
    }

    const user = await this.userRepository.update(userId, userData);
    return user ? this.toUserResponse(user) : null;
  }

  async deleteUser(userId: number): Promise<boolean> {
    return await this.userRepository.delete(userId);
  }

  private toUserResponse(user: any): UserResponse {
    return {
      user_id: user.user_id,
      user_code: user.user_code,
      username: user.username,
      role_id: user.role_id,
      location_id: user.location_id,
      location_ids: user.location_ids || [],
      is_active: user.is_active,
      created_at: user.created_at,
    };
  }
}
