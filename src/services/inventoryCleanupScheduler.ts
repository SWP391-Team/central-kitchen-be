import inventoryService from './inventoryService';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
let inventoryCleanupInterval: NodeJS.Timeout | null = null;

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const runInventoryCleanup = async (retentionDays: number): Promise<void> => {
  try {
    const deletedRows = await inventoryService.cleanupZeroQuantityRows(retentionDays);
    if (deletedRows > 0) {
      console.log(
        `[inventory-cleanup] archived ${deletedRows} zero-quantity rows older than ${retentionDays} days`
      );
    }
  } catch (error) {
    console.error('[inventory-cleanup] failed to cleanup zero-quantity rows', error);
  }
};

export const startInventoryCleanupScheduler = (): void => {
  if (inventoryCleanupInterval) {
    return;
  }

  const retentionDays = parsePositiveInt(process.env.INVENTORY_ARCHIVE_RETENTION_DAYS, 30);
  const intervalHours = parsePositiveInt(process.env.INVENTORY_ARCHIVE_INTERVAL_HOURS, 24);
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const runOnStartup = process.env.INVENTORY_ARCHIVE_RUN_ON_STARTUP !== 'false';

  if (runOnStartup) {
    void runInventoryCleanup(retentionDays);
  }

  inventoryCleanupInterval = setInterval(() => {
    void runInventoryCleanup(retentionDays);
  }, Math.max(intervalMs, DAY_IN_MS));

  inventoryCleanupInterval.unref();
  console.log(
    `[inventory-cleanup] scheduler started (retention=${retentionDays}d, interval=${Math.max(intervalMs, DAY_IN_MS) / (60 * 60 * 1000)}h)`
  );
};
