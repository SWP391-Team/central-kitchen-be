import { Router } from 'express';
import auditLogController from '../controllers/auditLogController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();

router.use(jwtMiddleware);
router.use(requireRole(1));

router.get('/', auditLogController.getAuditLogs);
router.get('/stats', auditLogController.getAuditStats);

export default router;
