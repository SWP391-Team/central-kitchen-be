import { Request, Response } from 'express';
import { AuthService, LoginDto } from '../services/authService';

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const loginData: LoginDto = req.body;

      if (!loginData.username || !loginData.password) {
        res.status(400).json({
          success: false,
          message: 'Username and password are required',
        });
        return;
      }

      const result = await this.authService.login(loginData);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid credentials') {
        res.status(401).json({
          success: false,
          message: 'Invalid username or password',
        });
      } else if (error instanceof Error && error.message === 'User account is inactive') {
        res.status(403).json({
          success: false,
          message: 'User account is inactive',
        });
      } else if (error instanceof Error && error.message.includes('store is inactive')) {
        res.status(403).json({
          success: false,
          message: error.message,
        });
      } else {
        console.error('Login error:', error);
        res.status(500).json({
          success: false,
          message: 'Internal server error',
        });
      }
    }
  };
}
