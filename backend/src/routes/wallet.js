const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verifyToken } = require('../utils/helpers');

// Middleware to verify JWT
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Get wallet balance and history
router.get('/balance', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT wallet_balance FROM users WHERE id = $1',
      [req.userId]
    );
    
    const transactions = await pool.query(
      `SELECT * FROM wallet_transactions 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [req.userId]
    );
    
    res.json({
      balance: result.rows[0]?.wallet_balance || 0,
      transactions: transactions.rows
    });
    
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Request withdrawal
router.post('/withdraw/request', authenticate, async (req, res) => {
  const { amount } = req.body;
  
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  
  try {
    // Check balance
    const userResult = await pool.query(
      'SELECT wallet_balance, phone FROM users WHERE id = $1',
      [req.userId]
    );
    
    const balance = userResult.rows[0]?.wallet_balance || 0;
    const phone = userResult.rows[0]?.phone;
    
    // Minimum withdrawal 10 Birr
    if (amount < 10) {
      return res.status(400).json({ error: 'Minimum withdrawal amount is 10 Birr' });
    }
    
    // Cannot withdraw all money - must leave at least 10 Birr
    if (balance - amount < 10) {
      return res.status(400).json({ error: 'You must leave at least 10 Birr in your wallet. Minimum remaining balance is 10 Birr.' });
    }
    
    if (amount > balance) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    // Create withdrawal request
    const result = await pool.query(
      `INSERT INTO withdrawal_requests (user_id, amount, phone, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [req.userId, amount, phone]
    );
    
    res.json({
      success: true,
      withdrawal: result.rows[0],
      message: `Withdrawal request for ${amount} Birr submitted successfully. Admin will process within 24 hours.`
    });
    
  } catch (error) {
    console.error('Withdrawal request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get withdrawal history
router.get('/withdraw/history', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM withdrawal_requests 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [req.userId]
    );
    
    res.json({ withdrawals: result.rows });
  } catch (error) {
    console.error('Withdrawal history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Request withdrawal
router.post('/withdraw', authenticate, async (req, res) => {
  const { amount } = req.body;
  
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  
  try {
    // Check balance
    const userResult = await pool.query(
      'SELECT wallet_balance FROM users WHERE id = $1',
      [req.userId]
    );
    
    const balance = userResult.rows[0]?.wallet_balance || 0;
    
    if (amount > balance) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    // Create withdrawal request
    const result = await pool.query(
      `INSERT INTO withdrawal_requests (user_id, amount, status)
       VALUES ($1, $2, 'pending')
       RETURNING *`,
      [req.userId, amount]
    );
    
    res.json({
      success: true,
      withdrawal: result.rows[0]
    });
    
  } catch (error) {
    console.error('Withdrawal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Request deposit (manual approval)
router.post('/deposit/request', authenticate, async (req, res) => {
  const { amount, transactionText } = req.body;
  
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  
  try {
    const result = await pool.query(
      `INSERT INTO deposit_requests (user_id, amount, transaction_text, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [req.userId, amount, transactionText]
    );
    
    res.json({
      success: true,
      deposit: result.rows[0]
    });
    
  } catch (error) {
    console.error('Deposit request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;