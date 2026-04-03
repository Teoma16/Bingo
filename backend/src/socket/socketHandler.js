const { pool } = require('../config/database');
const { verifyToken } = require('../utils/helpers');

// Game state management
const activeGames = new Map();
const playerSockets = new Map();
const gameTimers = new Map();
const gameCountdowns = new Map();

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
  
  // START COUNTDOWN EVENT - MOVED TO CORRECT PLACE
  socket.on('start_countdown', async (data) => {
    const { gameId } = data;
    
    if (gameCountdowns.has(gameId)) return;
    
    console.log(`Starting countdown for game ${gameId}`);
    
    let countdown = 40;
    
    const interval = setInterval(() => {
      io.to(`game_${gameId}`).emit('countdown', { seconds: countdown });
      countdown--;
      
      if (countdown < 0) {
        clearInterval(interval);
        gameCountdowns.delete(gameId);
        startGame(gameId, io);
      }
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
        socket.emit('bingo_accepted', { message: 'BINGO confirmed! Checking winners...' });
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
  
  // Numbers confirmed (taken numbers broadcast)
  socket.on('numbers_confirmed', async (data) => {
    const { gameId, luckyNumbers } = data;
    
    if (!socket.userId) return;
    
    try {
      io.to(`game_${gameId}`).emit('numbers_taken', {
        numbers: luckyNumbers,
        userId: socket.userId
      });
    } catch (error) {
      console.error('Error broadcasting taken numbers:', error);
    }
  });
  
  // Disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (socket.userId) {
      playerSockets.delete(socket.userId);
    }
  });
};

// Verify BINGO pattern
function verifyBingoPattern(cartelaData, calledNumbers) {
  try {
    const cartela = typeof cartelaData === 'string' ? JSON.parse(cartelaData) : cartelaData;
    
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

function verifyBingoPatternWithMarked(cartelaData, markedNumbers, calledNumbers) {
  const numbersToCheck = markedNumbers.length > 0 ? markedNumbers : calledNumbers;
  
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

// Auto-mark numbers
async function autoMarkNumbers(gameId, calledNumber, io) {
  try {
    const cartelas = await pool.query(
      'SELECT * FROM player_cartelas WHERE game_id = $1 AND is_auto_mode = true',
      [gameId]
    );
    
    for (const cartela of cartelas.rows) {
      const cartelaData = typeof cartela.cartela_data === 'string' ? JSON.parse(cartela.cartela_data) : cartela.cartela_data;
      let found = false;
      
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

// Check for winners
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
      
      const totalPool = game.rows[0].total_pool;
      const WINNER_PERCENTAGE = 78.75;
      
      const winnerShare = (totalPool * WINNER_PERCENTAGE) / 100;
      const prizeAmount = winnerShare / winners.length;
      
      console.log(`Total Pool: ${totalPool} Birr`);
      console.log(`Winner Share (${WINNER_PERCENTAGE}%): ${winnerShare} Birr`);
      console.log(`Each winner gets: ${prizeAmount} Birr`);
      
      // Credit all winners
      for (const winner of winners) {
        const updatedUser = await pool.query(
          `UPDATE users 
           SET wallet_balance = wallet_balance + $1, 
               total_games_won = total_games_won + 1, 
               total_winnings = total_winnings + $1 
           WHERE id = $2 
           RETURNING wallet_balance, total_games_won, total_winnings`,
          [prizeAmount, winner.userId]
        );
        
        await pool.query(
          `INSERT INTO wallet_transactions (user_id, amount, type, status, description)
           VALUES ($1, $2, 'prize', 'completed', $3)`,
          [winner.userId, prizeAmount, `Won Bingo game #${gameId} - ${prizeAmount} Birr`]
        );
        
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

// Award fast win bonus
async function awardFastWinBonus(userId, gameId, entryFee, io) {
  // ... keep existing code ...
}

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
    
    await pool.query(
      "UPDATE games SET status = 'active', started_at = NOW() WHERE id = $1",
      [gameId]
    );
    
    console.log(`Game ${gameId} started with ${playerCount.rows[0].count} players`);
    
    // Emit game_starting to all players
    io.to(`game_${gameId}`).emit('game_starting', { gameId });
    
    const calledNumbers = [];
    let numberIndex = 0;
    
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
    
    const callInterval = setInterval(async () => {
      if (gameState.winnerDeclared || numberIndex >= allNumbers.length) {
        if (numberIndex >= allNumbers.length && !gameState.winnerDeclared) {
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
      await checkForWinners(gameId, gameState, io);
      
    }, 4000);
    
    gameState.interval = callInterval;
    
  } catch (error) {
    console.error('Start game error:', error);
  }
}

module.exports = socketHandler;