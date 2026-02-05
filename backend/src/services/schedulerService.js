const db = require('../config/database');
const logger = require('../config/logger');
const cron = require('node-cron');

class SchedulerService {
  constructor() {
    this.isRunning = false;
  }

  // Start the scheduler
  start() {
    if (this.isRunning) {
      logger.warn('Scheduler is already running');
      return;
    }

    // Run every day at midnight
    cron.schedule('0 0 * * *', async () => {
      await this.processAllowances();
    });

    this.isRunning = true;
    logger.info('Allowance scheduler started - runs daily at midnight');
  }

  // Stop the scheduler
  stop() {
    // Note: cron jobs are persistent, this just marks as stopped
    this.isRunning = false;
    logger.info('Allowance scheduler stopped');
  }

  // Process allowances that are due
  async processAllowances() {
    try {
      logger.info('Processing allowances...');

      const now = new Date().toISOString();

      // Find allowances that are due and enabled
      const dueAllowances = await db.allAsync(`
        SELECT * FROM allowances
        WHERE enabled = 1 AND next_payment_date <= ?
      `, [now]);

      logger.info(`Found ${dueAllowances.length} allowances due for payment`);

      for (const allowance of dueAllowances) {
        await this.processAllowance(allowance);
      }

      logger.info('Allowance processing completed');
    } catch (error) {
      logger.error('Error processing allowances', { error });
    }
  }

  // Process a single allowance
  async processAllowance(allowance) {
    const transaction = await db.getAsync('BEGIN');

    try {
      // Create transaction
      const result = await db.runAsync(`
        INSERT INTO transactions (user_id, type, amount, description, created_by)
        VALUES (?, 'allowance', ?, ?, ?)
      `, [
        allowance.user_id,
        allowance.amount,
        `Automatic allowance payment (${allowance.frequency})`,
        null // System-generated, no created_by
      ]);

      // Update user balance
      await db.runAsync('UPDATE users SET balance = balance + ? WHERE id = ?', [
        allowance.amount,
        allowance.user_id
      ]);

      // Calculate next payment date
      const nextPaymentDate = this.calculateNextPaymentDate(allowance.frequency);

      // Update allowance next_payment_date
      await db.runAsync(`
        UPDATE allowances
        SET next_payment_date = ?, updated_at = ?
        WHERE id = ?
      `, [nextPaymentDate.toISOString(), new Date().toISOString(), allowance.id]);

      await db.runAsync('COMMIT');

      logger.info('Allowance payment processed', {
        allowanceId: allowance.id,
        userId: allowance.user_id,
        amount: allowance.amount,
        transactionId: result.lastID,
        nextPaymentDate
      });
    } catch (error) {
      await db.runAsync('ROLLBACK');
      logger.error('Error processing allowance payment', {
        error,
        allowanceId: allowance.id,
        userId: allowance.user_id
      });
    }
  }

  // Calculate next payment date based on frequency
  calculateNextPaymentDate(frequency) {
    const now = new Date();

    switch (frequency) {
      case 'daily':
        now.setDate(now.getDate() + 1);
        break;
      case 'weekly':
        now.setDate(now.getDate() + 7);
        break;
      case 'monthly':
        now.setMonth(now.getMonth() + 1);
        break;
      default:
        throw new Error(`Invalid frequency: ${frequency}`);
    }

    return now;
  }

  // Manual trigger for testing (process all due allowances now)
  async triggerManual() {
    logger.info('Manual allowance processing triggered');
    await this.processAllowances();
  }

  // Get status of scheduler
  getStatus() {
    return {
      isRunning: this.isRunning,
      nextRun: 'Daily at midnight (0 0 * * *)'
    };
  }
}

module.exports = new SchedulerService();