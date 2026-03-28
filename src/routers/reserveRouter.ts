import { Router } from 'express';
import reserveController from '../controllers/reserveController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();

router.use(jwtMiddleware);

router.get('/products', requireRole(1, 2, 3), reserveController.getReserveProducts);
router.get('/batches', requireRole(1, 2, 3), reserveController.getReserveBatches);
router.get('/history', requireRole(1, 2, 3), reserveController.getReserveHistory);

router.post('/products/:reserveId/allocate', requireRole(2), reserveController.allocateReserveBatch);

export default router;
