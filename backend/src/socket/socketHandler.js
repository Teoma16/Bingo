const { pool } = require('../config/database');
const { verifyToken } = require('../utils/helpers');

// Game state management
const activeGames = new Map(); // gameId -> { interval, calledNumbers, players, status }
const playerSockets = new Map(); // userId -> socketId
const gameTimers = new Map();

const socketHandler = (socket, io) => {
  console.log('New connection:', socket.id);
  
  // Authenticate user
  socket.on('authenticate', async (token) => {
    try {
      const decoded = verifyToken(token);
      if (!decoded) {
        console.log('Invalid token');
        socket.emit('error', { message: 'Invalid token' });
        return;
      }
      
      socket.userId = decoded.userId;
      playerSockets.set(decoded.userId, socket.id);
      console.log('✅ User authenticated:', decoded.userId);
      
      socket.emit('authenticated', { success: true });
      
      // Start countdown for any waiting games the user is in
      const waitingGames = await pool.query(
        `SELECT g.id FROM games g
         JOIN player_cartelas pc ON pc.game_id = g.id
         WHERE pc.user_id = $1 AND g.status = 'waiting'
         GROUP BY g.id`,
        [socket.userId]
      );
      
      for (const game of waitingGames.rows) {
        if (!gameTimers.has(game.id)) {
          startGameCountdown(game.id, io);
        }
      }
      
    } catch (error) {
      console.error('Auth error:', error);
      socket.emit('error', { message: 'Authentication failed' });
    }
  });
  // Add this at the top with other maps
const gameCountdowns = new Map();

// Add this event handler in socket.on('connection')
socket.on('start_countdown', async (data) => {
  const { gameId } = data;
  
  if (gameCountdowns.has(gameId)) return;
  
  let countdown = 40;
  
  const interval = setInterval(async () => {
    if (countdown <= 0) {
      clearInterval(interval);
      gameCountdowns.delete(gameId);
      
      // Start the game
      await startGame(gameId, io);
      return;
    }
    
    io.to(`game_${gameId}`).emit('countdown', { seconds: countdown });
    countdown--;
  }, 1000);
  
  gameCountdowns.set(gameId, interval);
});
  // Join game room
  socket.on('join_game', async (data) => {
    const { gameId } = data;
    
    if (!socket.userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }
    
    try {
      // Check if user is part of this game
      const cartelas = await pool.query(
        'SELECT * FROM player_cartelas WHERE game_id = $1 AND user_id = $2',
        [gameId, socket.userId]
      );
      
      if (cartelas.rows.length === 0) {
        socket.emit('error', { message: 'Not part of this game' });
        return;
      }
      
      socket.join(`game_${gameId}`);
      socket.emit('joined_game', { gameId, cartelas: cartelas.rows });
      
      // Send current game state if game is active
      const game = await pool.query(
        'SELECT * FROM games WHERE id = $1',
        [gameId]
      );
      
      if (game.rows[0] && game.rows[0].status === 'active') {
        const gameState = activeGames.get(parseInt(gameId));
        if (gameState) {
          socket.emit('game_state', {
            calledNumbers: gameState.calledNumbers,
            status: gameState.status
          });
        }
      }
      
      // Start countdown if game is waiting and not already started
      if (game.rows[0] && game.rows[0].status === 'waiting' && !gameTimers.has(gameId)) {
        startGameCountdown(gameId, io);
      }
      
    } catch (error) {
      console.error('Join game error:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });
  
  // Mark number manually
  socket.on('mark_number', async (data) => {
    const { gameId, cartelaId, number } = data;
    
    if (!socket.userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }
    
    try {
      // Get cartela
      const cartela = await pool.query(
        'SELECT * FROM player_cartelas WHERE id = $1 AND user_id = $2 AND game_id = $3',
        [cartelaId, socket.userId, gameId]
      );
      
      if (cartela.rows.length === 0) {
        socket.emit('error', { message: 'Cartela not found' });
        return;
      }
      
      let markedNumbers = cartela.rows[0].marked_numbers || [];
      
      if (!markedNumbers.includes(number)) {
        markedNumbers.push(number);
        
        await pool.query(
          'UPDATE player_cartelas SET marked_numbers = $1 WHERE id = $2',
          [JSON.stringify(markedNumbers), cartelaId]
        );
        
        socket.emit('number_marked', { cartelaId, number });
      }
      
    } catch (error) {
      console.error('Mark number error:', error);
      socket.emit('error', { message: 'Failed to mark number' });
    }
  });
  
  // Player calls BINGO
  // Player calls BINGO - Simplified
socket.on('call_bingo', async (data) => {
  const { gameId, cartelaId } = data;
  
  if (!socket.userId) {
    socket.emit('error', { message: 'Not authenticated' });
    return;
  }
  
  try {
    const gameState = activeGames.get(parseInt(gameId));
    
    if (!gameState || gameState.status !== 'active') {
      socket.emit('error', { message: 'Game not active' });
      return;
    }
    
    if (gameState.winnerDeclared) {
      socket.emit('error', { message: 'Winner already declared' });
      return;
    }
    
    // Get cartela and verify win
    const cartela = await pool.query(
      'SELECT * FROM player_cartelas WHERE id = $1 AND user_id = $2 AND game_id = $3',
      [cartelaId, socket.userId, gameId]
    );
    
    if (cartela.rows.length === 0) {
      socket.emit('error', { message: 'Cartela not found' });
      return;
    }
    
    const cartelaData = typeof cartela.rows[0].cartela_data === 'string' 
      ? JSON.parse(cartela.rows[0].cartela_data) 
      : cartela.rows[0].cartela_data;
    
    const markedNumbers = cartela.rows[0].marked_numbers || [];
    const isValid = verifyBingoPatternWithMarked(cartelaData, markedNumbers, gameState.calledNumbers);
    
    if (isValid) {
      // The checkForWinners function will handle the win
      // Just notify that this player called bingo
      socket.emit('bingo_accepted', { message: 'BINGO confirmed! Checking winners...' });
      // checkForWinners will be called after each number, so winners will be processed
    } else {
      socket.emit('invalid_bingo', { message: 'Invalid BINGO pattern! Check your numbers carefully.' });
    }
    
  } catch (error) {
    console.error('Call bingo error:', error);
    socket.emit('error', { message: 'Failed to process bingo' });
  }
});
  
  // Toggle auto/manual mode
  socket.on('toggle_mode', async (data) => {
    const { cartelaId, isAutoMode } = data;
    
    if (!socket.userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }
    
    try {
      await pool.query(
        'UPDATE player_cartelas SET is_auto_mode = $1 WHERE id = $2 AND user_id = $3',
        [isAutoMode, cartelaId, socket.userId]
      );
      
      socket.emit('mode_toggled', { cartelaId, isAutoMode });
      
    } catch (error) {
      console.error('Toggle mode error:', error);
      socket.emit('error', { message: 'Failed to toggle mode' });
    }
  });
  
  // Disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (socket.userId) {
      playerSockets.delete(socket.userId);
    }
  });
 // Add this inside the socketHandler function, after the authenticate event
// This will broadcast when a player confirms their cartelas

// Add this function to the socketHandler
// In the join endpoint, after successfully creating cartelas, broadcast the taken numbers
socket.on('numbers_confirmed', async (data) => {
  const { gameId, luckyNumbers } = data;
  
  if (!socket.userId) return;
  
  try {
    // Broadcast to all players in the game room
    io.to(`game_${gameId}`).emit('numbers_taken', {
      numbers: luckyNumbers,
      userId: socket.userId
    });
  } catch (error) {
    console.error('Error broadcasting taken numbers:', error);
  }
});
};

// Verify BINGO pattern (standard 5x5)
function verifyBingoPattern(cartelaData, calledNumbers) {
  try {
    const cartela = typeof cartelaData === 'string' ? JSON.parse(cartelaData) : cartelaData;
    
    // Check rows
    for (let row = 0; row < 5; row++) {
      let rowComplete = true;
      for (let col = 0; col < 5; col++) {
        const number = cartela[col][row];
        if (number !== 'FREE' && !calledNumbers.includes(number)) {
          rowComplete = false;
          break;
        }
      }
      if (rowComplete) return true;
    }
    
    // Check columns
    for (let col = 0; col < 5; col++) {
      let colComplete = true;
      for (let row = 0; row < 5; row++) {
        const number = cartela[col][row];
        if (number !== 'FREE' && !calledNumbers.includes(number)) {
          colComplete = false;
          break;
        }
      }
      if (colComplete) return true;
    }
    
    // Check diagonals
    let diag1Complete = true;
    let diag2Complete = true;
    
    for (let i = 0; i < 5; i++) {
      const num1 = cartela[i][i];
      if (num1 !== 'FREE' && !calledNumbers.includes(num1)) diag1Complete = false;
      
      const num2 = cartela[4 - i][i];
      if (num2 !== 'FREE' && !calledNumbers.includes(num2)) diag2Complete = false;
    }
    
    return diag1Complete || diag2Complete;
  } catch (error) {
    console.error('Verify pattern error:', error);
    return false;
  }
}

// Auto-mark numbers for players
async function autoMarkNumbers(gameId, calledNumber, io) {
  try {
    const cartelas = await pool.query(
      'SELECT * FROM player_cartelas WHERE game_id = $1 AND is_auto_mode = true',
      [gameId]
    );
    
    for (const cartela of cartelas.rows) {
      const cartelaData = typeof cartela.cartela_data === 'string' ? JSON.parse(cartela.cartela_data) : cartela.cartela_data;
      let found = false;
      
      // Check if number exists in cartela
      for (let col = 0; col < 5; col++) {
        for (let row = 0; row < 5; row++) {
          if (cartelaData[col][row] === calledNumber) {
            found = true;
            break;
          }
        }
        if (found) break;
      }
      
      if (found) {
        let markedNumbers = cartela.marked_numbers || [];
        if (!markedNumbers.includes(calledNumber)) {
          markedNumbers.push(calledNumber);
          await pool.query(
            'UPDATE player_cartelas SET marked_numbers = $1 WHERE id = $2',
            [JSON.stringify(markedNumbers), cartela.id]
          );
          
          // Notify player
          const playerSocketId = playerSockets.get(cartela.user_id);
          if (playerSocketId) {
            io.to(playerSocketId).emit('auto_marked', {
              cartelaId: cartela.id,
              number: calledNumber
            });
          }
        }
      }
    }
    
  } catch (error) {
    console.error('Auto mark error:', error);
  }
}
// Check for winners after each number is called
// When checking winners, get usernames
// Complete rewrite of checkForWinners function
// In the checkForWinners function, update the prize calculation
async function checkForWinners(gameId, gameState, io) {
  try {
    console.log(`Checking winners for game ${gameId}...`);
    
    const cartelas = await pool.query(
      `SELECT pc.*, u.id as user_id, u.username, u.telegram_id
       FROM player_cartelas pc
       JOIN users u ON u.id = pc.user_id
       WHERE pc.game_id = $1`,
      [gameId]
    );
    
    if (cartelas.rows.length === 0) return;
    
    const winners = [];
    
    for (const cartela of cartelas.rows) {
      let cartelaData;
      try {
        cartelaData = typeof cartela.cartela_data === 'string' 
          ? JSON.parse(cartela.cartela_data) 
          : cartela.cartela_data;
      } catch (e) {
        console.error('Error parsing cartela data:', e);
        continue;
      }
      
      const markedNumbers = cartela.marked_numbers || [];
      const numbersToCheck = markedNumbers.length > 0 ? markedNumbers : gameState.calledNumbers;
      
      let hasBingo = false;
      
      // Check rows
      for (let row = 0; row < 5; row++) {
        let rowComplete = true;
        for (let col = 0; col < 5; col++) {
          const number = cartelaData[col][row];
          if (number !== 'FREE' && !numbersToCheck.includes(number)) {
            rowComplete = false;
            break;
          }
        }
        if (rowComplete) {
          hasBingo = true;
          break;
        }
      }
      
      if (!hasBingo) {
        for (let col = 0; col < 5; col++) {
          let colComplete = true;
          for (let row = 0; row < 5; row++) {
            const number = cartelaData[col][row];
            if (number !== 'FREE' && !numbersToCheck.includes(number)) {
              colComplete = false;
              break;
            }
          }
          if (colComplete) {
            hasBingo = true;
            break;
          }
        }
      }
      
      if (!hasBingo) {
        let diag1Complete = true;
        let diag2Complete = true;
        
        for (let i = 0; i < 5; i++) {
          const num1 = cartelaData[i][i];
          if (num1 !== 'FREE' && !numbersToCheck.includes(num1)) diag1Complete = false;
          
          const num2 = cartelaData[4 - i][i];
          if (num2 !== 'FREE' && !numbersToCheck.includes(num2)) diag2Complete = false;
        }
        
        hasBingo = diag1Complete || diag2Complete;
      }
      
      if (hasBingo) {
        winners.push({
          userId: cartela.user_id,
          username: cartela.username || `Player ${cartela.telegram_id}`,
          cartelaId: cartela.id,
          luckyNumber: cartela.lucky_number
        });
        console.log(`Winner found: ${cartela.username}`);
      }
    }
    
    if (winners.length > 0 && !gameState.winnerDeclared) {
      console.log(`Declaring ${winners.length} winner(s)!`);
      gameState.winnerDeclared = true;
      gameState.winners = winners.map(w => ({
        userId: w.userId,
        cartelaId: w.cartelaId,
        timestamp: new Date()
      }));
      
      if (gameState.interval) {
        clearInterval(gameState.interval);
      }
      
      const game = await pool.query(
        'SELECT * FROM games WHERE id = $1',
        [gameId]
      );
      
      const room = await pool.query(
        'SELECT entry_fee, commission_percent FROM game_rooms WHERE id = $1',
        [game.rows[0].room_id]
      );
      
      const totalPool = game.rows[0].total_pool;
      
      // NEW: Calculate with 78.34% for winners, 21.66% for commission
      const WINNER_PERCENTAGE = 78.75;
      const COMMISSION_PERCENTAGE = 21.25;
      
      const winnerShare = (totalPool * WINNER_PERCENTAGE) / 100;
      const commissionAmount = totalPool - winnerShare;
      
      const prizeAmount = winnerShare / winners.length;
      
      console.log(`Total Pool: ${totalPool} Birr`);
      console.log(`Winner Share (${WINNER_PERCENTAGE}%): ${winnerShare} Birr`);
      console.log(`Commission (${COMMISSION_PERCENTAGE}%): ${commissionAmount} Birr`);
      console.log(`Each winner gets: ${prizeAmount} Birr`);
      
      // Record commission to admin commission table
      await pool.query(
        `INSERT INTO admin_commission (game_id, room_id, total_pool, commission_amount, winner_share, winner_count, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [gameId, game.rows[0].room_id, totalPool, commissionAmount, winnerShare, winners.length]
      );
      
      // Credit all winners
      for (const winner of winners) {
        // Update user in database
  const updatedUser = await pool.query(
    `UPDATE users 
     SET wallet_balance = wallet_balance + $1, 
         total_games_won = total_games_won + 1, 
         total_winnings = total_winnings + $1 
     WHERE id = $2 
     RETURNING wallet_balance, total_games_won, total_winnings`,
    [prizeAmount, winner.userId]
  );
  
  // Add transaction record
  await pool.query(
    `INSERT INTO wallet_transactions (user_id, amount, type, status, description)
     VALUES ($1, $2, 'prize', 'completed', $3)`,
    [winner.userId, prizeAmount, `Won Bingo game #${gameId} - ${prizeAmount} Birr`]
  );
  
  // Emit real-time update to the winner
  const winnerSocketId = playerSockets.get(winner.userId);
  if (winnerSocketId) {
    io.to(winnerSocketId).emit('user_stats_update', {
      walletBalance: updatedUser.rows[0].wallet_balance,
      totalGamesWon: updatedUser.rows[0].total_games_won,
      totalWinnings: updatedUser.rows[0].total_winnings
    });
  }
      }
      
      await pool.query(
        `UPDATE games SET status = 'completed', winners = $1, ended_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(gameState.winners), gameId]
      );
      
      io.to(`game_${gameId}`).emit('game_ended', {
        winners: gameState.winners.map(w => ({
          userId: w.userId,
          username: winners.find(win => win.userId === w.userId)?.username,
          cartelaId: w.cartelaId
        })),
        prizeAmount: prizeAmount,
        totalPool: totalPool,
        winnerShare: winnerShare,
        calledNumbers: gameState.calledNumbers,
        message: winners.length === 1 ? 'Single Winner!' : `${winners.length} Winners!`
      });
      
      setTimeout(() => {
        startGameCountdown(gameId, io);
      }, 5000);
    }
    
  } catch (error) {
    console.error('Error checking winners:', error);
  }
}

// Modified verify function that uses marked numbers (for auto winners)
function verifyBingoPatternWithMarked(cartelaData, markedNumbers, calledNumbers) {
  // Use either marked numbers or called numbers (auto mode marks automatically)
  const numbersToCheck = markedNumbers.length > 0 ? markedNumbers : calledNumbers;
  
  // Check rows
  for (let row = 0; row < 5; row++) {
    let rowComplete = true;
    for (let col = 0; col < 5; col++) {
      const number = cartelaData[col][row];
      if (number !== 'FREE' && !numbersToCheck.includes(number)) {
        rowComplete = false;
        break;
      }
    }
    if (rowComplete) return true;
  }
  
  // Check columns
  for (let col = 0; col < 5; col++) {
    let colComplete = true;
    for (let row = 0; row < 5; row++) {
      const number = cartelaData[col][row];
      if (number !== 'FREE' && !numbersToCheck.includes(number)) {
        colComplete = false;
        break;
      }
    }
    if (colComplete) return true;
  }
  
  // Check diagonals
  let diag1Complete = true;
  let diag2Complete = true;
  
  for (let i = 0; i < 5; i++) {
    const num1 = cartelaData[i][i];
    if (num1 !== 'FREE' && !numbersToCheck.includes(num1)) diag1Complete = false;
    
    const num2 = cartelaData[4 - i][i];
    if (num2 !== 'FREE' && !numbersToCheck.includes(num2)) diag2Complete = false;
  }
  
  return diag1Complete || diag2Complete;
}
// Award fast win bonus
async function awardFastWinBonus(userId, gameId, entryFee, io) {
  try {
    // Get bonus settings
    const settings = await pool.query(
      "SELECT config FROM bonus_settings WHERE bonus_type = 'fast_win' AND is_active = true"
    );
    
    if (settings.rows.length > 0) {
      const config = settings.rows[0].config;
      const bonusPercentage = config.bonus_percentage || 1000;
      const bonusAmount = (entryFee * bonusPercentage) / 100;
      
      // Check night bonus
      let finalBonus = bonusAmount;
      if (config.night_bonus && config.night_bonus.enabled) {
        const now = new Date();
        const currentHour = now.getHours();
        const nightStart = parseInt(config.night_bonus.start);
        const nightEnd = parseInt(config.night_bonus.end);
        
        if (currentHour >= nightStart || currentHour < nightEnd) {
          finalBonus = bonusAmount * 2;
        }
      }
      
      // Award bonus
      await pool.query(
        'UPDATE users SET wallet_balance = wallet_balance + $1, total_bonus_won = total_bonus_won + $1 WHERE id = $2',
        [finalBonus, userId]
      );
      
      await pool.query(
        `INSERT INTO wallet_transactions (user_id, amount, type, status, description)
         VALUES ($1, $2, 'bonus', 'completed', $3)`,
        [userId, finalBonus, `Fast win bonus for game #${gameId}`]
      );
      
      const playerSocketId = playerSockets.get(userId);
      if (playerSocketId) {
        io.to(playerSocketId).emit('bonus_awarded', {
          type: 'fast_win',
          amount: finalBonus,
          message: `Fast win bonus! +${finalBonus} Birr`
        });
      }
    }
    
  } catch (error) {
    console.error('Fast win bonus error:', error);
  }
}

// Start game countdown
// Start game countdown
async function startGameCountdown(gameId, io) {
  if (gameTimers.has(gameId)) {
    console.log(`Countdown already running for game ${gameId}`);
    return;
  }
  
  let countdown = 40;
  
  console.log(`Starting countdown for game ${gameId}`);
  
  const interval = setInterval(async () => {
    const gameCheck = await pool.query(
      'SELECT status FROM games WHERE id = $1',
      [gameId]
    );
    
    if (gameCheck.rows.length === 0 || gameCheck.rows[0].status !== 'waiting') {
      clearInterval(interval);
      gameTimers.delete(gameId);
      return;
    }
    
    if (countdown <= 0) {
      clearInterval(interval);
      gameTimers.delete(gameId);
      
      const playerCount = await pool.query(
        'SELECT COUNT(DISTINCT user_id) as count FROM player_cartelas WHERE game_id = $1',
        [gameId]
      );
      
      if (playerCount.rows[0].count >= 2) {
        await startGame(gameId, io);
      } else {
        io.to(`game_${gameId}`).emit('waiting_for_players', { 
          message: `Need more players. ${playerCount.rows[0].count}/2 players. Restarting countdown...` 
        });
        setTimeout(() => {
          startGameCountdown(gameId, io);
        }, 2000);
      }
    } else {
      // Only emit countdown if game is still waiting
      const currentGameCheck = await pool.query(
        'SELECT status FROM games WHERE id = $1',
        [gameId]
      );
      if (currentGameCheck.rows[0]?.status === 'waiting') {
        io.to(`game_${gameId}`).emit('countdown', { seconds: countdown });
        countdown--;
      } else {
        clearInterval(interval);
        gameTimers.delete(gameId);
      }
    }
  }, 1000);
  
  gameTimers.set(gameId, interval);
}

// Start active game
async function startGame(gameId, io) {
  try {
    // Check player count again
    const playerCount = await pool.query(
      'SELECT COUNT(DISTINCT user_id) as count FROM player_cartelas WHERE game_id = $1',
      [gameId]
    );
    
    if (playerCount.rows[0].count < 2) {
      console.log(`Game ${gameId} doesn't have enough players, waiting...`);
      setTimeout(() => {
        startGameCountdown(gameId, io);
      }, 5000);
      return;
    }
    
    // Update game status to active
    await pool.query(
      "UPDATE games SET status = 'active', started_at = NOW() WHERE id = $1",
      [gameId]
    );
    
    console.log(`Game ${gameId} started with ${playerCount.rows[0].count} players`);
    
    const calledNumbers = [];
    let numberIndex = 0;
    
    // Generate all 75 numbers in random order
    const allNumbers = [];
    for (let i = 1; i <= 75; i++) allNumbers.push(i);
    
    for (let i = allNumbers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allNumbers[i], allNumbers[j]] = [allNumbers[j], allNumbers[i]];
    }
    
    const gameState = {
      interval: null,
      calledNumbers: calledNumbers,
      status: 'active',
      winnerDeclared: false,
      winners: []
    };
    
    activeGames.set(gameId, gameState);
    
  // When game starts, emit to all players
io.to(`game_${gameId}`).emit('game_starting', { gameId });
    
    // Start calling numbers
    // Start calling numbers
const callInterval = setInterval(async () => {
  if (gameState.winnerDeclared || numberIndex >= allNumbers.length) {
    if (numberIndex >= allNumbers.length && !gameState.winnerDeclared) {
      // No winner, game ends
      io.to(`game_${gameId}`).emit('game_ended', {
        winners: [],
        message: 'No winner this game',
        calledNumbers: calledNumbers
      });
      
      await pool.query(
        "UPDATE games SET status = 'completed', ended_at = NOW() WHERE id = $1",
        [gameId]
      );
      
      clearInterval(callInterval);
      activeGames.delete(gameId);
      
      // Start next game countdown
      setTimeout(() => {
        startGameCountdown(gameId, io);
      }, 5000);
    }
    return;
  }
  
  const number = allNumbers[numberIndex];
  calledNumbers.push(number);
  numberIndex++;
  
  let letter = '';
  if (number <= 15) letter = 'B';
  else if (number <= 30) letter = 'I';
  else if (number <= 45) letter = 'N';
  else if (number <= 60) letter = 'G';
  else letter = 'O';
  
  io.to(`game_${gameId}`).emit('number_called', {
    number: number,
    letter: letter,
    calledNumbers: calledNumbers
  });
  
  await autoMarkNumbers(gameId, number, io);
  
  // *** NEW: Check for winners after each number ***
  await checkForWinners(gameId, gameState, io);
  
}, 4000);
    
    gameState.interval = callInterval;
    
  } catch (error) {
    console.error('Start game error:', error);
  }
}
// Add this function to broadcast player count
async function broadcastPlayerCount(roomId, io) {
  try {
    // Get active game in this room
    const gameResult = await pool.query(
      `SELECT g.id FROM games g 
       WHERE g.room_id = $1 AND g.status = 'waiting'
       ORDER BY g.created_at DESC LIMIT 1`,
      [roomId]
    );
    
    if (gameResult.rows.length > 0) {
      const gameId = gameResult.rows[0].id;
      
      const playerCount = await pool.query(
        'SELECT COUNT(DISTINCT user_id) as count FROM player_cartelas WHERE game_id = $1',
        [gameId]
      );
      
      // Broadcast to all clients in the dashboard
      io.emit('player_count_update', {
        roomId: roomId,
        playerCount: parseInt(playerCount.rows[0].count)
      });
    }
  } catch (error) {
    console.error('Error broadcasting player count:', error);
  }
}
// When a game ends, automatically start countdown for next game
async function onGameEnded(gameId, io) {
  try {
    // Get room ID from the ended game
    const roomResult = await pool.query(
      'SELECT room_id FROM games WHERE id = $1',
      [gameId]
    );
    
    if (roomResult.rows.length > 0) {
      const roomId = roomResult.rows[0].room_id;
      
      // Create new waiting game
      const newGame = await pool.query(
        `INSERT INTO games (room_id, status, total_pool, total_players)
         VALUES ($1, 'waiting', $2, 0)
         RETURNING id`,
        [roomId, 0]
      );
      
      const newGameId = newGame.rows[0].id;
      console.log(`Created new game ${newGameId} for room ${roomId}`);
      
      // Start countdown for new game after 5 seconds
      setTimeout(() => {
        startGameCountdown(newGameId, io);
      }, 5000);
    }
  } catch (error) {
    console.error('Error in onGameEnded:', error);
  }
}

module.exports = socketHandler;