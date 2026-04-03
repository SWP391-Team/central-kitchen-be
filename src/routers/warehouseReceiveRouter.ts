import { Router } from 'express';
import warehouseReceiveController from '../controllers/warehouseReceiveController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();
router.use(jwtMiddleware);

router.get('/', requireRole(1, 2, 3), warehouseReceiveController.getAll);
router.get('/transfer/:transferId', requireRole(1, 2, 3), warehouseReceiveController.getByTransferId);
router.get('/received-by-suggestions', requireRole(1, 2, 3), warehouseReceiveController.searchReceivedBySuggestions);
router.get('/:id', requireRole(1, 2, 3), warehouseReceiveController.getById);
router.post('/', requireRole(2, 3), warehouseReceiveController.create);

export default router;
