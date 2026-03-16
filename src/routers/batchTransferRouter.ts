import { Router } from 'express';
import batchTransferController from '../controllers/batchTransferController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();
router.use(jwtMiddleware);

router.get('/', requireRole(1, 2), batchTransferController.getAll);
router.get('/delivering', requireRole(1, 2), batchTransferController.getDelivering);
router.get('/batch/:batchId', requireRole(1, 2), batchTransferController.getByBatchId);
router.post('/', requireRole(1, 2), batchTransferController.create);
router.post('/:id/complete-receive', requireRole(1, 2), batchTransferController.completeReceive);

export default router;
