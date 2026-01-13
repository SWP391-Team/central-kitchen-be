import { Request, Response } from 'express';
import { UserService } from '../services/userService';
import { UserCreateDto, UserUpdateDto } from '../models/User';

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  getAllUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const users = await this.userService.getAllUsers();
      res.json({
        success: true,
        data: users,
      });
    } catch (error) {
      console.error('Get all users error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  getUserById = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.params.id as string);
      
      if (isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid user ID',
        });
        return;
      }

      const user = await this.userService.getUserById(userId);
      
      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      console.error('Get user by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  createUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const userData: UserCreateDto = req.body;

      if (!userData.username || !userData.password || !userData.role_id) {
        res.status(400).json({
          success: false,
          message: 'Username, password, and role_id are required',
        });
        return;
      }

      const user = await this.userService.createUser(userData);

      res.status(201).json({
        success: true,
        data: user,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Username already exists') {
        res.status(409).json({
          success: false,
          message: 'Username already exists',
        });
      } else {
        console.error('Create user error:', error);
        res.status(500).json({
          success: false,
          message: 'Internal server error',
        });
      }
    }
  };

  updateUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.params.id as string);
      const userData: UserUpdateDto = req.body;

      if (isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid user ID',
        });
        return;
      }

      const user = await this.userService.updateUser(userId, userData);

      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Username already exists') {
        res.status(409).json({
          success: false,
          message: 'Username already exists',
        });
      } else {
        console.error('Update user error:', error);
        res.status(500).json({
          success: false,
          message: 'Internal server error',
        });
      }
    }
  };

  deleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = parseInt(req.params.id as string);

      if (isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid user ID',
        });
        return;
      }

      const success = await this.userService.deleteUser(userId);

      if (!success) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };
}
