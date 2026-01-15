import { Router } from 'express';
import { UserController } from '../controllers/userController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';

const router = Router();
const userController = new UserController();

// All user routes require authentication
router.use(jwtMiddleware);

router.get('/', userController.getAllUsers);
router.get('/:id', userController.getUserById);
router.post('/', userController.createUser);
router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);

export default router;
