import { Router } from 'express';
import unitController from '../controllers/unitController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();

router.use(jwtMiddleware);

router.get('/', requireRole(1, 2, 3), unitController.getAllUnits);
router.get('/active', requireRole(1, 2, 3), unitController.getActiveUnits);
router.get('/:id', requireRole(1, 2, 3), unitController.getUnitById);

router.post('/', requireRole(1, 2), unitController.createUnit);
router.put('/:id', requireRole(1, 2), unitController.updateUnit);
router.put('/:id/toggle-active', requireRole(1, 2), unitController.toggleUnitActive);

export default router;
