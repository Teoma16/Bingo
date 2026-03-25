const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verifyToken } = require('../utils/helpers');

// Middleware to verify admin
const authenticateAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    // For now, let's consider user with id 1 as admin
    // In production, add an 'is_admin' column to users table
    if (decoded.userId !== 1) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Get advertisement settings
router.get('/advertisement', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM advertisement_settings WHERE id = 1'
    );
    
    if (result.rows.length === 0) {
      // Return default if not found
      return res.json({
        is_enabled: false,
        image_url: null,
        message: null
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get advertisement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update advertisement settings
router.post('/advertisement', authenticateAdmin, async (req, res) => {
  const { isEnabled, imageUrl, message } = req.body;
  
  try {
    // Check if record exists
    const existing = await pool.query(
      'SELECT id FROM advertisement_settings WHERE id = 1'
    );
    
    if (existing.rows.length === 0) {
      // Insert new record
      await pool.query(
        `INSERT INTO advertisement_settings (id, is_enabled, image_url, message, updated_at)
         VALUES (1, $1, $2, $3, NOW())`,
        [isEnabled, imageUrl, message]
      );
    } else {
      // Update existing record
      await pool.query(
        `UPDATE advertisement_settings 
         SET is_enabled = $1, image_url = $2, message = $3, updated_at = NOW()
         WHERE id = 1`,
        [isEnabled, imageUrl, message]
      );
    }
    
    res.json({ success: true, message: 'Advertisement settings updated' });
  } catch (error) {
    console.error('Update advertisement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get room statistics
router.get('/rooms/stats', authenticateAdmin, async (req, res) => {
  try {
    const rooms = await pool.query('SELECT * FROM game_rooms');
    
    const stats = [];
    
    for (const room of rooms.rows) {
      const activeGame = await pool.query(
        `SELECT g.*, COUNT(DISTINCT pc.user_id) as player_count
         FROM games g
         LEFT JOIN player_cartelas pc ON pc.game_id = g.id
         WHERE g.room_id = $1 AND g.status IN ('waiting', 'active')
         GROUP BY g.id`,
        [room.id]
      );
      
      stats.push({
        room: room,
        current_players: activeGame.rows[0]?.player_count || 0,
        current_game: activeGame.rows[0] || null
      });
    }
    
    res.json({ stats });
  } catch (error) {
    console.error('Room stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get financial reports
router.get('/reports/financial', authenticateAdmin, async (req, res) => {
  const { startDate, endDate } = req.query;
  
  try {
    let query = `
      SELECT 
        SUM(CASE WHEN type = 'prize' THEN amount ELSE 0 END) as total_prizes,
        SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END) as total_deposits,
        SUM(CASE WHEN type = 'withdrawal' THEN amount ELSE 0 END) as total_withdrawals,
        COUNT(CASE WHEN type = 'prize' THEN 1 END) as total_wins
      FROM wallet_transactions
      WHERE status = 'completed'
    `;
    
    const params = [];
    
    if (startDate && endDate) {
      query += ` AND created_at BETWEEN $1 AND $2`;
      params.push(startDate, endDate);
    }
    
    const result = await pool.query(query, params);
    
    // Get commission from games
    const gamesQuery = await pool.query(
      `SELECT SUM(total_pool * commission_percent / 100) as total_commission
       FROM games g
       JOIN game_rooms r ON r.id = g.room_id
       WHERE g.status = 'completed'
       ${startDate && endDate ? 'AND g.ended_at BETWEEN $1 AND $2' : ''}`,
      params
    );
    
    res.json({
      ...result.rows[0],
      total_commission: gamesQuery.rows[0]?.total_commission || 0
    });
  } catch (error) {
    console.error('Financial reports error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const users = await pool.query(
      `SELECT id, username, telegram_id, phone, wallet_balance, 
              total_games_played, total_games_won, total_bonus_won, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    
    res.json({ users: users.rows });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user details
router.get('/users/:userId', authenticateAdmin, async (req, res) => {
  const { userId } = req.params;
  
  try {
    const user = await pool.query(
      `SELECT id, username, telegram_id, phone, wallet_balance, 
              total_games_played, total_games_won, total_bonus_won, created_at
       FROM users WHERE id = $1`,
      [userId]
    );
    
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const transactions = await pool.query(
      `SELECT * FROM wallet_transactions 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 100`,
      [userId]
    );
    
    const games = await pool.query(
      `SELECT g.*, r.name as room_name
       FROM player_cartelas pc
       JOIN games g ON g.id = pc.game_id
       JOIN game_rooms r ON r.id = g.room_id
       WHERE pc.user_id = $1
       ORDER BY g.created_at DESC
       LIMIT 50`,
      [userId]
    );
    
    res.json({
      user: user.rows[0],
      transactions: transactions.rows,
      games: games.rows
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update wallet balance (admin)
router.post('/users/:userId/wallet', authenticateAdmin, async (req, res) => {
  const { userId } = req.params;
  const { amount, type, description } = req.body;
  
  try {
    await pool.query(
      'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
      [amount, userId]
    );
    
    await pool.query(
      `INSERT INTO wallet_transactions (user_id, amount, type, status, description)
       VALUES ($1, $2, $3, 'completed', $4)`,
      [userId, amount, type, description || 'Admin adjustment']
    );
    
    res.json({ success: true, message: 'Wallet updated successfully' });
  } catch (error) {
    console.error('Update wallet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get pending deposits
router.get('/deposits', authenticateAdmin, async (req, res) => {
  try {
    const deposits = await pool.query(
      `SELECT * FROM deposit_requests 
       ORDER BY created_at DESC`
    );
    
    res.json({ deposits: deposits.rows });
  } catch (error) {
    console.error('Get deposits error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve deposit
router.post('/deposits/:depositId/approve', authenticateAdmin, async (req, res) => {
  const { depositId } = req.params;
  
  try {
    const deposit = await pool.query(
      'SELECT * FROM deposit_requests WHERE id = $1 AND status = $2',
      [depositId, 'pending']
    );
    
    if (deposit.rows.length === 0) {
      return res.status(404).json({ error: 'Deposit request not found' });
    }
    
    // Update deposit status
    await pool.query(
      `UPDATE deposit_requests 
       SET status = 'approved', approved_by = $1, approved_at = NOW()
       WHERE id = $2`,
      [req.userId, depositId]
    );
    
    // Credit user wallet
    await pool.query(
      'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
      [deposit.rows[0].amount, deposit.rows[0].user_id]
    );
    
    // Add transaction
    await pool.query(
      `INSERT INTO wallet_transactions (user_id, amount, type, status, description)
       VALUES ($1, $2, 'deposit', 'completed', $3)`,
      [deposit.rows[0].user_id, deposit.rows[0].amount, 'Deposit approved']
    );
    
    res.json({ success: true, message: 'Deposit approved successfully' });
  } catch (error) {
    console.error('Approve deposit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update bonus settings
router.post('/bonus-settings', authenticateAdmin, async (req, res) => {
  const { bonusType, config } = req.body;
  
  try {
    await pool.query(
      `UPDATE bonus_settings 
       SET config = $1, updated_at = NOW()
       WHERE bonus_type = $2`,
      [JSON.stringify(config), bonusType]
    );
    
    res.json({ success: true, message: 'Bonus settings updated' });
  } catch (error) {
    console.error('Update bonus settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;