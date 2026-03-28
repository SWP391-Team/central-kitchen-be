import { Router } from 'express';
import productionPlanController from '../controllers/productionPlanController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();

router.use(jwtMiddleware);

router.get('/', requireRole(1, 2), productionPlanController.getProductionPlans);
router.get('/:id', requireRole(1, 2), productionPlanController.getProductionPlanById);

router.post('/', requireRole(2), productionPlanController.createProductionPlan);
router.put('/:id/release', requireRole(2), productionPlanController.releasePlan);
router.put('/:id/cancel', requireRole(2), productionPlanController.cancelProductionPlan);
router.put('/:id/close', requireRole(2), productionPlanController.closeProductionPlan);

export default router;
