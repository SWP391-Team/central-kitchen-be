import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './config/database';
import authRouter from './routers/authRouter';
import userRouter from './routers/userRouter';
import locationRouter from './routers/locationRouter';
import productRouter from './routers/productRouter';
import productionPlanRouter from './routers/productionPlanRouter';
import productionBatchRouter from './routers/productionBatchRouter';
import qualityInspectionRouter from './routers/qualityInspectionRouter';
import reworkRecordRouter from './routers/reworkRecordRouter';
import batchTransferRouter from './routers/batchTransferRouter';
import warehouseReceiveRouter from './routers/warehouseReceiveRouter';
import inventoryRouter from './routers/inventoryRouter';
import supplyOrderRouter from './routers/supplyOrderRouter';
import auditLogRouter from './routers/auditLogRouter';
import unitRouter from './routers/unitRouter';
import reserveRouter from './routers/reserveRouter';
import { auditLogMiddleware } from './middlewares/auditLogMiddleware';
import { startInventoryCleanupScheduler } from './services/inventoryCleanupScheduler';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(auditLogMiddleware);

app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/locations', locationRouter);
app.use('/api/products', productRouter);
app.use('/api/production-plans', productionPlanRouter);
app.use('/api/production-batches', productionBatchRouter);
app.use('/api/quality-inspections', qualityInspectionRouter);
app.use('/api/rework-records', reworkRecordRouter);
app.use('/api/batch-transfers', batchTransferRouter);
app.use('/api/warehouse-receives', warehouseReceiveRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/supply-orders', supplyOrderRouter);
app.use('/api/reserves', reserveRouter);
app.use('/api/audit-logs', auditLogRouter);
app.use('/api/units', unitRouter);

app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      status: 'OK',
      message: 'Central Kitchen Management API is running',
      database: 'Connected',
      timestamp: result.rows[0].now
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: 'API is running but database connection failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

startInventoryCleanupScheduler();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
