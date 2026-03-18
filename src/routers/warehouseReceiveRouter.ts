import { Router } from 'express';
import warehouseReceiveController from '../controllers/warehouseReceiveController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();
router.use(jwtMiddleware);

router.get('/', requireRole(1, 2, 3), warehouseReceiveController.getAll);
router.get(
  '/transfer/:transferId',
  requireRole(1, 2, 3),
  warehouseReceiveController.getByTransferId
);
router.post('/', requireRole(1, 2, 3), warehouseReceiveController.create);

export default router;
