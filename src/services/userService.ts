import bcrypt from 'bcrypt';
import { UserRepository } from '../repositories/userRepository';
import { UserCreateDto, UserUpdateDto, UserResponse } from '../models/User';

export class UserService {
  private userRepository: UserRepository;
  private readonly DEACTIVATION_BLOCKED_ERROR_PREFIX = 'USER_DEACTIVATION_BLOCKED:';

  private isUserCodeConflict(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const dbError = error as { code?: string; constraint?: string; detail?: string };
    if (dbError.code !== '23505') {
      return false;
    }

    const combinedMessage = `${dbError.constraint || ''} ${dbError.detail || ''}`.toLowerCase();
    return combinedMessage.includes('user_code');
  }

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

  async createUser(userData: UserCreateDto, createdBy: number): Promise<UserResponse> {
    const existingUser = await this.userRepository.findByUsername(userData.username);
    if (existingUser) {
      throw new Error('Username already exists');
    }

    const normalizedLocationIds = this.normalizeLocationIds(
      userData.location_ids ?? (userData.location_id !== undefined && userData.location_id !== null ? [userData.location_id] : [])
    );

    const hashedPassword = await bcrypt.hash(userData.password, 10);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const generatedUserCode = await this.userRepository.generateNextUserCode();

      try {
        const user = await this.userRepository.create({
          ...userData,
          user_code: generatedUserCode,
          password: hashedPassword,
          location_ids: normalizedLocationIds,
          location_id: normalizedLocationIds[0] ?? null,
          created_by: createdBy,
        });

        return this.toUserResponse(user);
      } catch (error) {
        if (this.isUserCodeConflict(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('Failed to generate unique user code');
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

    if (userData.is_active === false) {
      const currentUser = await this.userRepository.findById(userId);

      if (!currentUser) {
        return null;
      }

      if (currentUser.is_active) {
        const blockingAssignments = await this.userRepository.getDeactivationBlockingAssignments(userId);
        const warningItems: string[] = [];

        if (blockingAssignments.productionBatchCodes.length > 0) {
          warningItems.push(`Produce (${blockingAssignments.productionBatchCodes.length})`);
        }
        if (blockingAssignments.qualityInspectionCodes.length > 0) {
          warningItems.push(`Inspection (${blockingAssignments.qualityInspectionCodes.length})`);
        }
        if (blockingAssignments.reworkCodes.length > 0) {
          warningItems.push(`Rework (${blockingAssignments.reworkCodes.length})`);
        }

        if (warningItems.length > 0) {
          throw new Error(
            `${this.DEACTIVATION_BLOCKED_ERROR_PREFIX}Cannot deactivate this user because they are assigned to active tasks: ${warningItems.join(', ')}.`
          );
        }
      }
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
      created_by: user.created_by ?? null,
      created_at: user.created_at,
    };
  }
}
