import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './config/database';
import authRouter from './routers/authRouter';
import userRouter from './routers/userRouter';
import storeRouter from './routers/storeRouter';
import productRouter from './routers/productRouter';
import productBatchRouter from './routers/productBatchRouter';
import inventoryRouter from './routers/inventoryRouter';
import supplyOrderRouter from './routers/supplyOrderRouter';
import kitchenProductionRouter from './routers/kitchenProductionRouter';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/stores', storeRouter);
app.use('/api/products', productRouter);
app.use('/api/batches', productBatchRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/supply-orders', supplyOrderRouter);
app.use('/api/kitchen-production', kitchenProductionRouter);

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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
