import { Router } from 'express';
import reworkRecordController from '../controllers/reworkRecordController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();

router.use(jwtMiddleware);

router.post('/start', requireRole(1, 2), reworkRecordController.startRework);
router.put('/:id/finish', requireRole(1, 2), reworkRecordController.finishRework);
router.put('/batch/:batchId/send-to-qc', requireRole(1, 2), reworkRecordController.sendToQC);
router.get('/', requireRole(1, 2), reworkRecordController.getAllReworkRecords);
router.get('/:id', requireRole(1, 2), reworkRecordController.getReworkById);
router.get('/batch/:batchId', requireRole(1, 2), reworkRecordController.getReworksByBatchId);

export default router;
