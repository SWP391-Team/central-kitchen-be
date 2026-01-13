import bcrypt from 'bcrypt';
import { UserRepository } from '../repositories/userRepository';
import { UserCreateDto, UserUpdateDto, UserResponse } from '../models/User';

export class UserService {
  private userRepository: UserRepository;

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
    // Check if username already exists
    const existingUser = await this.userRepository.findByUsername(userData.username);
    if (existingUser) {
      throw new Error('Username already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    const user = await this.userRepository.create({
      ...userData,
      password: hashedPassword,
    });

    return this.toUserResponse(user);
  }

  async updateUser(userId: number, userData: UserUpdateDto): Promise<UserResponse | null> {
    // Check if username is being changed and already exists
    if (userData.username) {
      const existingUser = await this.userRepository.findByUsername(userData.username);
      if (existingUser && existingUser.user_id !== userId) {
        throw new Error('Username already exists');
      }
    }

    // Hash password if it's being updated
    if (userData.password) {
      userData.password = await bcrypt.hash(userData.password, 10);
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
      username: user.username,
      role_id: user.role_id,
      store_id: user.store_id,
      is_active: user.is_active,
      created_at: user.created_at,
    };
  }
}
