const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { comparePassword, generateToken, verifyToken } = require('../utils/helpers'); // Add verifyToken here

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Find user by phone number (primary login method)
    const result = await pool.query(
      `SELECT * FROM users WHERE phone = $1 OR username = $1 OR telegram_id::text = $1`,
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // Compare password
    const isValid = await comparePassword(password, user.password_hash);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate token
    const token = generateToken(user.id, user.telegram_id);
    
    // Return user data (excluding sensitive info)
    const userData = {
      id: user.id,
      telegram_id: user.telegram_id,
      username: user.username,
      phone: user.phone,
      wallet_balance: user.wallet_balance,
      total_games_played: user.total_games_played,
      total_games_won: user.total_games_won,
      total_bonus_won: user.total_bonus_won,
      total_winnings: user.total_winnings || 0
    };
    
    res.json({
      success: true,
      token,
      user: userData
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    const result = await pool.query(
      `SELECT id, telegram_id, username, phone, wallet_balance, total_games_played, 
              total_games_won, total_bonus_won, total_winnings, created_at
       FROM users WHERE id = $1`,
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user: result.rows[0] });
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Telegram Web App authentication
router.post('/telegram-auth', async (req, res) => {
  const { initData, userId } = req.body;
  
  try {
    // Verify the hash (for production, verify the initData signature)
    // For now, find or create user by telegram ID
    let user = await pool.query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [userId]
    );
    
    if (user.rows.length === 0) {
      // Create user if doesn't exist
      const newUser = await pool.query(
        `INSERT INTO users (telegram_id, username, wallet_balance) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
        [userId, `tg_user_${userId}`, 500]
      );
      user = newUser;
    }
    
    // Generate JWT token
    const token = generateToken(user.rows[0].id, userId);
    
    res.json({
      success: true,
      token,
      user: user.rows[0]
    });
  } catch (error) {
    console.error('Telegram auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});
module.exports = router;