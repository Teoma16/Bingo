const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verifyToken, generateCartela } = require('../utils/helpers');

// Middleware to verify JWT
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    
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
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Helper function to get cartela from database (NOT top-level, inside a function)
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

// Get all active rooms
router.get('/rooms', authenticate, async (req, res) => {
  try {
    const rooms = await pool.query(
      'SELECT * FROM game_rooms WHERE is_active = true ORDER BY entry_fee'
    );
    
    const activeGames = await pool.query(
      `SELECT g.room_id, COUNT(DISTINCT pc.user_id) as player_count 
       FROM games g
       LEFT JOIN player_cartelas pc ON pc.game_id = g.id
       WHERE g.status IN ('waiting', 'active')
       GROUP BY g.room_id`
    );
    
    const playerCounts = {};
    activeGames.rows.forEach(row => {
      playerCounts[row.room_id] = parseInt(row.player_count);
    });
    
    const roomsWithCount = rooms.rows.map(room => ({
      ...room,
      current_players: playerCounts[room.id] || 0
    }));
    
    res.json({ rooms: roomsWithCount });
    
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Join a room - using fixed cartelas
// Join a room - using fixed cartelas
// Join a room - using fixed cartelas
router.post('/rooms/:roomId/join', authenticate, async (req, res) => {
  const { roomId } = req.params;
  const { cartelaCount = 1, luckyNumbers = [] } = req.body;
  
  console.log('Join request:', { roomId, cartelaCount, luckyNumbers, userId: req.userId });
  
  try {
    // Check if room exists
    const roomResult = await pool.query(
      'SELECT * FROM game_rooms WHERE id = $1 AND is_active = true',
      [roomId]
    );
    
    if (roomResult.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const room = roomResult.rows[0];
    const requiredBalance = room.entry_fee * cartelaCount;
    
    // Check user balance
    const userResult = await pool.query(
      'SELECT wallet_balance FROM users WHERE id = $1',
      [req.userId]
    );
    
    const balance = userResult.rows[0]?.wallet_balance || 0;
    
    if (balance < requiredBalance) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        required: requiredBalance,
        balance: balance
      });
    }
    
    // Find or create active game
    let gameResult = await pool.query(
      `SELECT * FROM games 
       WHERE room_id = $1 AND status = 'waiting'
       ORDER BY created_at DESC LIMIT 1`,
      [roomId]
    );
    
    let game;
    
    if (gameResult.rows.length === 0) {
      const newGame = await pool.query(
        `INSERT INTO games (room_id, status, total_pool, total_players)
         VALUES ($1, 'waiting', $2, 0)
         RETURNING *`,
        [roomId, 0]
      );
      game = newGame.rows[0];
      console.log('Created new game:', game.id);
    } else {
      game = gameResult.rows[0];
      console.log('Using existing game:', game.id);
    }
    
    // Check if game is active
    if (game.status === 'active') {
      return res.status(400).json({ 
        error: 'Game already in progress. Please wait for next game.' 
      });
    }
    
    // Check if lucky numbers are already taken
    if (luckyNumbers.length > 0) {
      const takenNumbersResult = await pool.query(
        'SELECT lucky_number FROM player_cartelas WHERE game_id = $1 AND lucky_number = ANY($2::int[])',
        [game.id, luckyNumbers]
      );
      
      if (takenNumbersResult.rows.length > 0) {
        const takenNumbers = takenNumbersResult.rows.map(r => r.lucky_number);
        return res.status(400).json({ 
          error: `Lucky numbers ${takenNumbers.join(', ')} are already taken by other players.`,
          takenNumbers: takenNumbers
        });
      }
    }
    
    // Generate cartelas using fixed cartelas
    const cartelas = [];
    const numbersToUse = luckyNumbers.length > 0 ? luckyNumbers : 
      Array.from({ length: cartelaCount }, () => Math.floor(Math.random() * 100) + 1);
    
    for (let i = 0; i < numbersToUse.length; i++) {
      const luckyNumber = numbersToUse[i];
      
      let cartelaData = await getFixedCartela(luckyNumber);
      
      let cartelaDataForInsert;
      if (typeof cartelaData === 'string') {
        cartelaDataForInsert = cartelaData;
      } else if (typeof cartelaData === 'object') {
        cartelaDataForInsert = JSON.stringify(cartelaData);
      } else {
        cartelaDataForInsert = JSON.stringify(generateCartela());
      }
      
      const cartelaResult = await pool.query(
        `INSERT INTO player_cartelas (game_id, user_id, room_id, lucky_number, cartela_data, marked_numbers)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [game.id, req.userId, roomId, luckyNumber, cartelaDataForInsert, JSON.stringify([])]
      );
      
      cartelas.push(cartelaResult.rows[0]);
    }
    
    // Deduct balance and increment games played
    await pool.query(
      `UPDATE users SET wallet_balance = wallet_balance - $1, total_games_played = total_games_played + 1 WHERE id = $2`,
      [requiredBalance, req.userId]
    );
    
    // Add transaction record
    await pool.query(
      `INSERT INTO wallet_transactions (user_id, amount, type, status, description)
       VALUES ($1, $2, 'deduction', 'completed', $3)`,
      [req.userId, -requiredBalance, `Joined ${room.name} with ${cartelaCount} cartela(s)`]
    );
    
    // Get updated player count
    const playerCountResult = await pool.query(
      'SELECT COUNT(DISTINCT user_id) as count FROM player_cartelas WHERE game_id = $1',
      [game.id]
    );
    const newPlayerCount = parseInt(playerCountResult.rows[0].count);
    
    // Calculate total pool - FIXED: simpler query
    // Get all cartelas for this game and sum entry fees
    const cartelasForPool = await pool.query(
      `SELECT pc.user_id, COUNT(pc.id) as cartela_count, r.entry_fee
       FROM player_cartelas pc
       JOIN game_rooms r ON r.id = pc.room_id
       WHERE pc.game_id = $1
       GROUP BY pc.user_id, r.entry_fee`,
      [game.id]
    );
    
    let totalPool = 0;
    for (const row of cartelasForPool.rows) {
      totalPool += row.entry_fee * row.cartela_count;
    }
    
    console.log(`Game ${game.id} - Total Pool: ${totalPool}, Players: ${newPlayerCount}`);
    
    // Update game
    await pool.query(
      `UPDATE games SET total_pool = $1, total_players = $2 WHERE id = $3`,
      [totalPool, newPlayerCount, game.id]
    );
    
    // Broadcast player count update
    try {
      const io = require('../server').io;
if (io) {
  io.to(`game_${game.id}`).emit('numbers_taken', {
    numbers: luckyNumbers,
    userId: req.userId
  });
}
    } catch (err) {
      console.error('Error broadcasting:', err);
    }
    
    res.json({
      success: true,
      game: { ...game, total_pool: totalPool },
      cartelas: cartelas,
      deducted: requiredBalance
    });
    
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Generate cartela for preview
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
      if (typeof cartela === 'string') {
        cartela = JSON.parse(cartela);
      }
    } else {
      cartela = generateCartela();
    }
    
    res.json({ luckyNumber, cartela });
  } catch (error) {
    console.error('Error generating cartela:', error);
    res.status(500).json({ error: 'Failed to generate cartela' });
  }
});

// Leave room
router.post('/rooms/:roomId/leave', authenticate, async (req, res) => {
  const { roomId } = req.params;
  
  try {
    const gameResult = await pool.query(
      `SELECT * FROM games 
       WHERE room_id = $1 AND status = 'waiting'
       ORDER BY created_at DESC LIMIT 1`,
      [roomId]
    );
    
    if (gameResult.rows.length > 0) {
      const game = gameResult.rows[0];
      
      const cartelas = await pool.query(
        `SELECT * FROM player_cartelas 
         WHERE game_id = $1 AND user_id = $2`,
        [game.id, req.userId]
      );
      
      if (cartelas.rows.length > 0) {
        const room = await pool.query('SELECT entry_fee FROM game_rooms WHERE id = $1', [roomId]);
        const refundAmount = room.rows[0].entry_fee * cartelas.rows.length;
        
        await pool.query(
          `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
          [refundAmount, req.userId]
        );
        
        await pool.query(
          `INSERT INTO wallet_transactions (user_id, amount, type, status, description)
           VALUES ($1, $2, 'refund', 'completed', $3)`,
          [req.userId, refundAmount, `Left ${roomId} room - refund`]
        );
        
        await pool.query(
          `DELETE FROM player_cartelas WHERE game_id = $1 AND user_id = $2`,
          [game.id, req.userId]
        );
        
        const newPlayerCount = (await pool.query(
          'SELECT COUNT(DISTINCT user_id) FROM player_cartelas WHERE game_id = $1',
          [game.id]
        )).rows[0].count;
        
        await pool.query(
          `UPDATE games SET total_players = $1 WHERE id = $2`,
          [newPlayerCount, game.id]
        );
        
        // Broadcast player count update
       try {
    const { io } = require('../server');
    if (io) {
      console.log(`Broadcasting player count update after leave: Room ${roomId}, Players: ${newPlayerCount}`);
      io.emit('player_count_update', {
        roomId: parseInt(roomId),
        playerCount: newPlayerCount
      });
    }
  } catch (err) {
    console.error('Error broadcasting leave:', err);
  }
  
      }
    }
    
    res.json({ success: true, message: 'Left room successfully' });
    
  } catch (error) {
    console.error('Leave room error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Get current game (single room)
router.get('/current', authenticate, async (req, res) => {
  try {
    // Get or create waiting game for room 1 (10 Birr room)
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
    
    // Get user's cartelas for this game
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
      players: players.rows
    });
  } catch (error) {
    console.error('Get current game error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update game selection (add/remove cartelas)
router.post('/update-selection', authenticate, async (req, res) => {
  const { luckyNumbers = [] } = req.body;
  const ROOM_ID = 1;
  const ENTRY_FEE = 10;
  
  try {
    // Check for active game
    const activeGame = await pool.query(
      `SELECT * FROM games WHERE room_id = $1 AND status = 'active'`,
      [ROOM_ID]
    );
    
    if (activeGame.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Game already in progress. Cannot change selection.'
      });
    }
    
    // Get current game
    let gameResult = await pool.query(
      `SELECT * FROM games WHERE room_id = $1 AND status = 'waiting'
       ORDER BY created_at DESC LIMIT 1`,
      [ROOM_ID]
    );
    
    let game;
    if (gameResult.rows.length === 0) {
      // Create new game if none exists
      const newGame = await pool.query(
        `INSERT INTO games (room_id, status, total_pool, total_players)
         VALUES ($1, 'waiting', 0, 0)
         RETURNING *`,
        [ROOM_ID]
      );
      game = newGame.rows[0];
    } else {
      game = gameResult.rows[0];
    }
    
    // Get user's current cartelas
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
        return res.status(400).json({ 
          error: `Numbers ${takenNumbers.rows.map(r => r.lucky_number).join(', ')} are already taken`
        });
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
      return res.status(400).json({ 
        error: 'Insufficient balance to add more cartelas',
        required: additionalCost,
        balance
      });
    }
    
    // Remove cartelas
    if (numbersToRemove.length > 0) {
      await pool.query(
        'DELETE FROM player_cartelas WHERE game_id = $1 AND user_id = $2 AND lucky_number = ANY($3::int[])',
        [game.id, req.userId, numbersToRemove]
      );
      
      // Refund
      const refundAmount = ENTRY_FEE * numbersToRemove.length;
      await pool.query(
        'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
        [refundAmount, req.userId]
      );
    }
    
    // Add new cartelas
    const newCartelas = [];
    for (const luckyNumber of numbersToAdd) {
      const cartelaDataResult = await pool.query(
        'SELECT cartela_data FROM fixed_cartelas WHERE lucky_number = $1',
        [luckyNumber]
      );
      
      let cartelaData;
      if (cartelaDataResult.rows.length > 0) {
        cartelaData = cartelaDataResult.rows[0].cartela_data;
        if (typeof cartelaData === 'string') {
          cartelaData = JSON.parse(cartelaData);
        }
      } else {
        cartelaData = generateCartela();
      }
      
      const newCartela = await pool.query(
        `INSERT INTO player_cartelas (game_id, user_id, room_id, lucky_number, cartela_data, marked_numbers, is_auto_mode)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [game.id, req.userId, ROOM_ID, luckyNumber, JSON.stringify(cartelaData), JSON.stringify([]), true]
      );
      
      newCartelas.push(newCartela.rows[0]);
    }
    
    // Deduct cost for new cartelas
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
    
    // Update game pool
    const totalPoolResult = await pool.query(
      'SELECT SUM(entry_fee) as total FROM player_cartelas pc JOIN game_rooms r ON r.id = pc.room_id WHERE pc.game_id = $1',
      [game.id]
    );
    const newPool = parseFloat(totalPoolResult.rows[0]?.total || 0);
    
    const playerCountResult = await pool.query(
      'SELECT COUNT(DISTINCT user_id) FROM player_cartelas WHERE game_id = $1',
      [game.id]
    );
    
    await pool.query(
      'UPDATE games SET total_pool = $1, total_players = $2 WHERE id = $3',
      [newPool, parseInt(playerCountResult.rows[0].count), game.id]
    );
    
    // Broadcast update to other players
    const io = require('../server').io;
    if (io) {
      io.emit('player_joined', { gameId: game.id });
    }
    
    res.json({
      success: true,
      game: { ...game, total_pool: newPool },
      cartelas: allCartelas.rows
    });
    
  } catch (error) {
    console.error('Update selection error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});
// Join current game
router.post('/join', authenticate, async (req, res) => {
  const { luckyNumbers = [] } = req.body;
  const ROOM_ID = 1;
  const ENTRY_FEE = 10;
  
  console.log('Join request - luckyNumbers:', luckyNumbers);
  
  try {
    // Check for active game
    const activeGame = await pool.query(
      `SELECT * FROM games WHERE room_id = $1 AND status = 'active'`,
      [ROOM_ID]
    );
    
    if (activeGame.rows.length > 0) {
      return res.status(400).json({ 
        error: 'A game is currently in progress. Please wait for it to finish.'
      });
    }
    
    // Get or create waiting game
    let gameResult = await pool.query(
      `SELECT * FROM games WHERE room_id = $1 AND status = 'waiting'
       ORDER BY created_at DESC LIMIT 1`,
      [ROOM_ID]
    );
    
    let game;
    if (gameResult.rows.length === 0) {
      const newGame = await pool.query(
        `INSERT INTO games (room_id, status, total_pool, total_players)
         VALUES ($1, 'waiting', 0, 0)
         RETURNING *`,
        [ROOM_ID]
      );
      game = newGame.rows[0];
      console.log('Created new game:', game.id);
    } else {
      game = gameResult.rows[0];
      console.log('Using existing game:', game.id);
    }
    
    // Check if numbers are taken
    const takenNumbersResult = await pool.query(
      'SELECT lucky_number FROM player_cartelas WHERE game_id = $1 AND lucky_number = ANY($2::int[])',
      [game.id, luckyNumbers]
    );
    
    if (takenNumbersResult.rows.length > 0) {
      const takenNumbers = takenNumbersResult.rows.map(r => r.lucky_number);
      return res.status(400).json({ 
        error: `Lucky numbers ${takenNumbers.join(', ')} are already taken.`,
        takenNumbers
      });
    }
    
    // Check balance
    const userResult = await pool.query(
      'SELECT wallet_balance FROM users WHERE id = $1',
      [req.userId]
    );
    
    const balance = userResult.rows[0]?.wallet_balance || 0;
    const requiredBalance = ENTRY_FEE * luckyNumbers.length;
    
    if (balance < requiredBalance) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        required: requiredBalance,
        balance
      });
    }
    
    // Create cartelas
    const cartelas = [];
    for (const luckyNumber of luckyNumbers) {
      // Get fixed cartela from database
      const cartelaResult = await pool.query(
        'SELECT cartela_data FROM fixed_cartelas WHERE lucky_number = $1',
        [luckyNumber]
      );
      
      let cartelaData;
      if (cartelaResult.rows.length > 0) {
        // cartela_data is already in JSON format
        cartelaData = cartelaResult.rows[0].cartela_data;
        // If it's a string, parse it first then stringify for insert
        if (typeof cartelaData === 'string') {
          cartelaData = JSON.parse(cartelaData);
        }
      } else {
        // Fallback: generate cartela
        cartelaData = generateCartela();
      }
      
      // Ensure cartela_data is valid JSON
      const cartelaDataForInsert = JSON.stringify(cartelaData);
      
      const newCartela = await pool.query(
        `INSERT INTO player_cartelas (game_id, user_id, room_id, lucky_number, cartela_data, marked_numbers, is_auto_mode)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [game.id, req.userId, ROOM_ID, luckyNumber, cartelaDataForInsert, JSON.stringify([]), true]
      );
      
      cartelas.push(newCartela.rows[0]);
      console.log(`Created cartela for lucky number ${luckyNumber}`);
    }
    
    // Deduct balance
    await pool.query(
      `UPDATE users SET wallet_balance = wallet_balance - $1, total_games_played = total_games_played + 1 WHERE id = $2`,
      [requiredBalance, req.userId]
    );
    
    // Add transaction
    await pool.query(
      `INSERT INTO wallet_transactions (user_id, amount, type, status, description)
       VALUES ($1, $2, 'deduction', 'completed', $3)`,
      [req.userId, -requiredBalance, `Joined game with ${luckyNumbers.length} cartela(s)`]
    );
    
    // Update game pool
    const newPool = (game.total_pool || 0) + requiredBalance;
    const playerCountResult = await pool.query(
      'SELECT COUNT(DISTINCT user_id) as count FROM player_cartelas WHERE game_id = $1',
      [game.id]
    );
    const newPlayerCount = parseInt(playerCountResult.rows[0].count);
    
    await pool.query(
      `UPDATE games SET total_pool = $1, total_players = $2 WHERE id = $3`,
      [newPool, newPlayerCount, game.id]
    );
    
    console.log(`Game ${game.id} updated - Pool: ${newPool}, Players: ${newPlayerCount}`);
    
    res.json({
      success: true,
      game: { ...game, total_pool: newPool },
      cartelas
    });
    
  } catch (error) {
    console.error('Join error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Leave current game
router.post('/leave', authenticate, async (req, res) => {
  const ROOM_ID = 1;
  
  try {
    const gameResult = await pool.query(
      `SELECT * FROM games WHERE room_id = $1 AND status = 'waiting'
       ORDER BY created_at DESC LIMIT 1`,
      [ROOM_ID]
    );
    
    if (gameResult.rows.length > 0) {
      const game = gameResult.rows[0];
      
      const cartelas = await pool.query(
        `SELECT * FROM player_cartelas WHERE game_id = $1 AND user_id = $2`,
        [game.id, req.userId]
      );
      
      if (cartelas.rows.length > 0) {
        const refundAmount = ENTRY_FEE * cartelas.rows.length;
        
        await pool.query(
          `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
          [refundAmount, req.userId]
        );
        
        await pool.query(
          `DELETE FROM player_cartelas WHERE game_id = $1 AND user_id = $2`,
          [game.id, req.userId]
        );
        
        const newPlayerCount = (await pool.query(
          'SELECT COUNT(DISTINCT user_id) FROM player_cartelas WHERE game_id = $1',
          [game.id]
        )).rows[0].count;
        
        await pool.query(
          `UPDATE games SET total_players = $1 WHERE id = $2`,
          [newPlayerCount, game.id]
        );
        
        // Update pool
        const totalPool = await pool.query(
          `SELECT SUM(r.entry_fee * COUNT(pc.id)) as total_pool
           FROM player_cartelas pc
           JOIN game_rooms r ON r.id = pc.room_id
           WHERE pc.game_id = $1
           GROUP BY pc.game_id`,
          [game.id]
        );
        
        await pool.query(
          `UPDATE games SET total_pool = $1 WHERE id = $2`,
          [totalPool.rows[0]?.total_pool || 0, game.id]
        );
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Leave error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Get taken numbers for a game
router.get('/games/:gameId/taken-numbers', authenticate, async (req, res) => {
  const { gameId } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT lucky_number FROM player_cartelas WHERE game_id = $1',
      [gameId]
    );
    
    const takenNumbers = result.rows.map(row => row.lucky_number);
    res.json({ takenNumbers });
  } catch (error) {
    console.error('Error getting taken numbers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get game state
router.get('/games/:gameId', authenticate, async (req, res) => {
  const { gameId } = req.params;
  
  try {
    const game = await pool.query(
      `SELECT g.*, r.name as room_name, r.entry_fee, r.commission_percent
       FROM games g
       JOIN game_rooms r ON r.id = g.room_id
       WHERE g.id = $1`,
      [gameId]
    );
    
    if (game.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    const cartelas = await pool.query(
      `SELECT * FROM player_cartelas 
       WHERE game_id = $1 AND user_id = $2`,
      [gameId, req.userId]
    );
    
    const allPlayers = await pool.query(
      `SELECT DISTINCT u.id, u.username, u.telegram_id
       FROM player_cartelas pc
       JOIN users u ON u.id = pc.user_id
       WHERE pc.game_id = $1`,
      [gameId]
    );
    
    res.json({
      game: game.rows[0],
      cartelas: cartelas.rows,
      players: allPlayers.rows
    });
    
  } catch (error) {
    console.error('Get game error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check room game status
router.get('/rooms/:roomId/status', authenticate, async (req, res) => {
  const { roomId } = req.params;
  
  try {
    const activeGame = await pool.query(
      `SELECT * FROM games 
       WHERE room_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [roomId]
    );
    
    if (activeGame.rows.length > 0) {
      return res.json({ 
        hasActiveGame: true,
        gameId: activeGame.rows[0].id
      });
    }
    
    const waitingGame = await pool.query(
      `SELECT * FROM games 
       WHERE room_id = $1 AND status = 'waiting'
       ORDER BY created_at DESC LIMIT 1`,
      [roomId]
    );
    
    res.json({ 
      hasActiveGame: false,
      waitingGame: waitingGame.rows[0] || null
    });
  } catch (error) {
    console.error('Check game status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;