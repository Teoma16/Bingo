const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verifyToken, generateCartela } = require('../utils/helpers');

// Helper function to get cartela from database
const getFixedCartela = async (luckyNumber) => {
  try {
    const result = await pool.query(
      'SELECT cartela_data FROM fixed_cartelas WHERE lucky_number = $1',
      [luckyNumber]
    );
    if (result.rows.length > 0) {
      return result.rows[0].cartela_data;
    }
    return generateCartela();
  } catch (error) {
    console.error('Error getting fixed cartela:', error);
    return generateCartela();
  }
};

// Middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: 'Invalid token' });
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Get current game state
router.get('/current', authenticate, async (req, res) => {
  try {
    // Get or create waiting game for room 1
    let gameResult = await pool.query(
      `SELECT * FROM games WHERE room_id = 1 AND status IN ('waiting', 'active')
       ORDER BY created_at DESC LIMIT 1`,
      []
    );
    
    let game;
    if (gameResult.rows.length === 0) {
      const newGame = await pool.query(
        `INSERT INTO games (room_id, status, total_pool, total_players)
         VALUES (1, 'waiting', 0, 0)
         RETURNING *`,
        []
      );
      game = newGame.rows[0];
    } else {
      game = gameResult.rows[0];
    }
    
    // Get user's cartelas
    const cartelas = await pool.query(
      `SELECT * FROM player_cartelas WHERE game_id = $1 AND user_id = $2`,
      [game.id, req.userId]
    );
    
    // Get all players
    const players = await pool.query(
      `SELECT DISTINCT u.id, u.username FROM player_cartelas pc
       JOIN users u ON u.id = pc.user_id
       WHERE pc.game_id = $1`,
      [game.id]
    );
    
    res.json({
      game,
      cartelas: cartelas.rows,
      players: players.rows,
      total_players: players.rows.length
    });
  } catch (error) {
    console.error('Get current game error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update selection (add/remove cartelas)
router.post('/update-selection', authenticate, async (req, res) => {
  const { luckyNumbers = [] } = req.body;
  const ENTRY_FEE = 10;
  
  try {
    // Check for active game
    const activeGame = await pool.query(
      `SELECT * FROM games WHERE room_id = 1 AND status = 'active'`,
      []
    );
    
    if (activeGame.rows.length > 0) {
      return res.status(400).json({ error: 'Game already in progress' });
    }
    
    // Get or create waiting game
    let gameResult = await pool.query(
      `SELECT * FROM games WHERE room_id = 1 AND status = 'waiting'
       ORDER BY created_at DESC LIMIT 1`,
      []
    );
    
    let game;
    if (gameResult.rows.length === 0) {
      const newGame = await pool.query(
        `INSERT INTO games (room_id, status, total_pool, total_players)
         VALUES (1, 'waiting', 0, 0)
         RETURNING *`,
        []
      );
      game = newGame.rows[0];
    } else {
      game = gameResult.rows[0];
    }
    
    // Get current cartelas
    const currentCartelas = await pool.query(
      'SELECT * FROM player_cartelas WHERE game_id = $1 AND user_id = $2',
      [game.id, req.userId]
    );
    
    const currentNumbers = currentCartelas.rows.map(c => c.lucky_number);
    const numbersToAdd = luckyNumbers.filter(n => !currentNumbers.includes(n));
    const numbersToRemove = currentNumbers.filter(n => !luckyNumbers.includes(n));
    
    // Check if numbers to add are available
    if (numbersToAdd.length > 0) {
      const takenNumbers = await pool.query(
        'SELECT lucky_number FROM player_cartelas WHERE game_id = $1 AND lucky_number = ANY($2::int[])',
        [game.id, numbersToAdd]
      );
      if (takenNumbers.rows.length > 0) {
        return res.status(400).json({ error: 'Some numbers are already taken' });
      }
    }
    
    // Check balance for new cartelas
    const userResult = await pool.query(
      'SELECT wallet_balance FROM users WHERE id = $1',
      [req.userId]
    );
    const balance = userResult.rows[0]?.wallet_balance || 0;
    const additionalCost = ENTRY_FEE * numbersToAdd.length;
    
    if (additionalCost > 0 && balance < additionalCost) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    // Remove cartelas and refund
    if (numbersToRemove.length > 0) {
      await pool.query(
        'DELETE FROM player_cartelas WHERE game_id = $1 AND user_id = $2 AND lucky_number = ANY($3::int[])',
        [game.id, req.userId, numbersToRemove]
      );
      const refundAmount = ENTRY_FEE * numbersToRemove.length;
      await pool.query(
        'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
        [refundAmount, req.userId]
      );
    }
    
    // Add new cartelas
    for (const luckyNumber of numbersToAdd) {
      const cartelaData = await getFixedCartela(luckyNumber);
      let cartelaDataForInsert;
      if (typeof cartelaData === 'string') {
        cartelaDataForInsert = cartelaData;
      } else {
        cartelaDataForInsert = JSON.stringify(cartelaData);
      }
      
      await pool.query(
        `INSERT INTO player_cartelas (game_id, user_id, room_id, lucky_number, cartela_data, marked_numbers, is_auto_mode)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [game.id, req.userId, 1, luckyNumber, cartelaDataForInsert, JSON.stringify([]), true]
      );
    }
    
    // Deduct cost
    if (additionalCost > 0) {
      await pool.query(
        'UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2',
        [additionalCost, req.userId]
      );
    }
    
    // Get all cartelas after changes
    const allCartelas = await pool.query(
      'SELECT * FROM player_cartelas WHERE game_id = $1 AND user_id = $2',
      [game.id, req.userId]
    );
    
    // Update game pool and player count
    const playerCountResult = await pool.query(
      'SELECT COUNT(DISTINCT user_id) FROM player_cartelas WHERE game_id = $1',
      [game.id]
    );
    const newPlayerCount = parseInt(playerCountResult.rows[0].count);
    
    const totalPoolResult = await pool.query(
      'SELECT SUM(10) as total FROM player_cartelas WHERE game_id = $1',
      [game.id]
    );
    const newPool = parseFloat(totalPoolResult.rows[0]?.total || 0);
    
    await pool.query(
      'UPDATE games SET total_pool = $1, total_players = $2 WHERE id = $3',
      [newPool, newPlayerCount, game.id]
    );
    
    // Broadcast update to all clients
    const io = require('../server').io;
    if (io) {
      io.emit('game_update', { gameId: game.id, playerCount: newPlayerCount, pool: newPool });
    }
    
    // Start countdown if we have at least 2 players and countdown not started
    if (newPlayerCount >= 2 && game.status === 'waiting') {
      const io = require('../server').io;
      if (io) {
        io.emit('start_countdown', { gameId: game.id });
      }
    }
    
    res.json({
      success: true,
      game: { ...game, total_pool: newPool, total_players: newPlayerCount },
      cartelas: allCartelas.rows
    });
    
  } catch (error) {
    console.error('Update selection error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Get taken numbers
router.get('/:gameId/taken-numbers', authenticate, async (req, res) => {
  const { gameId } = req.params;
  try {
    const result = await pool.query(
      'SELECT lucky_number FROM player_cartelas WHERE game_id = $1',
      [gameId]
    );
    res.json({ takenNumbers: result.rows.map(r => r.lucky_number) });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate cartela preview
router.post('/generate-cartela', authenticate, async (req, res) => {
  const { luckyNumber } = req.body;
  try {
    const result = await pool.query(
      'SELECT cartela_data FROM fixed_cartelas WHERE lucky_number = $1',
      [luckyNumber]
    );
    let cartela;
    if (result.rows.length > 0) {
      cartela = result.rows[0].cartela_data;
      if (typeof cartela === 'string') cartela = JSON.parse(cartela);
    } else {
      cartela = generateCartela();
    }
    res.json({ luckyNumber, cartela });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate cartela' });
  }
});

// Leave game
router.post('/leave', authenticate, async (req, res) => {
  try {
    const gameResult = await pool.query(
      `SELECT * FROM games WHERE room_id = 1 AND status = 'waiting'
       ORDER BY created_at DESC LIMIT 1`,
      []
    );
    
    if (gameResult.rows.length > 0) {
      const game = gameResult.rows[0];
      
      const cartelas = await pool.query(
        'SELECT * FROM player_cartelas WHERE game_id = $1 AND user_id = $2',
        [game.id, req.userId]
      );
      
      if (cartelas.rows.length > 0) {
        const refundAmount = 10 * cartelas.rows.length;
        await pool.query(
          'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
          [refundAmount, req.userId]
        );
        
        await pool.query(
          'DELETE FROM player_cartelas WHERE game_id = $1 AND user_id = $2',
          [game.id, req.userId]
        );
        
        const playerCountResult = await pool.query(
          'SELECT COUNT(DISTINCT user_id) FROM player_cartelas WHERE game_id = $1',
          [game.id]
        );
        const newPlayerCount = parseInt(playerCountResult.rows[0].count);
        
        const totalPoolResult = await pool.query(
          'SELECT SUM(10) as total FROM player_cartelas WHERE game_id = $1',
          [game.id]
        );
        const newPool = parseFloat(totalPoolResult.rows[0]?.total || 0);
        
        await pool.query(
          'UPDATE games SET total_pool = $1, total_players = $2 WHERE id = $3',
          [newPool, newPlayerCount, game.id]
        );
        
        const io = require('../server').io;
        if (io) {
          io.emit('game_update', { gameId: game.id, playerCount: newPlayerCount, pool: newPool });
        }
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Leave error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;