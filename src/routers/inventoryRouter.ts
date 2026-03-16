import { Router } from 'express';
import inventoryController from '../controllers/inventoryController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';

const router = Router();
router.use(jwtMiddleware);

router.get('/batches', inventoryController.getBatchInventory);
router.get('/transactions', inventoryController.getInventoryTransactions);

export default router;
