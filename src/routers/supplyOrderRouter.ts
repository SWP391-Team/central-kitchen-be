import { Router } from 'express';
import supplyOrderController from '../controllers/supplyOrderController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();

router.use(jwtMiddleware);

router.post('/store', requireRole(3), supplyOrderController.createSupplyOrder); 
router.get('/store', requireRole(1, 3), supplyOrderController.getAllSupplyOrders); 
router.get('/store/:id', requireRole(1, 3), supplyOrderController.getSupplyOrderById); 
router.get('/store/by-store/:storeId', requireRole(1), supplyOrderController.getSupplyOrdersByStore);
router.post('/store/:id/confirm-received', requireRole(3), supplyOrderController.confirmReceived);
router.post('/store/:id/stock', requireRole(3), supplyOrderController.stockSupplyOrder);
router.post('/store/:id/cancel', requireRole(3), supplyOrderController.cancelSupplyOrder);

router.get('/central', requireRole(1, 2), supplyOrderController.getAllSupplyOrdersCentral); 
router.get('/central/:id', requireRole(1, 2), supplyOrderController.getSupplyOrderById); 
router.post('/central/:id/review', requireRole(2), supplyOrderController.reviewSupplyOrder);
router.post('/central/:id/start-delivery', requireRole(2), supplyOrderController.startDelivery); 
router.post('/central/:id/cancel', requireRole(2), supplyOrderController.cancelSupplyOrder);

export default router;
