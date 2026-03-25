const TelegramBot = require('node-telegram-bot-api');
const { pool } = require('../config/database');
const { hashPassword, generateToken } = require('../utils/helpers');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set in .env file!');
} else {
  console.log('🤖 Initializing Telegram Bot...');
}

let bot = null;

try {
  if (token) {
    bot = new TelegramBot(token, { polling: true });
    console.log('✅ Telegram bot created successfully');
  }
} catch (error) {
  console.error('❌ Failed to create Telegram bot:', error.message);
  bot = null;
}

// Store temporary registration data
const registrationSteps = new Map();
const withdrawalSteps = new Map();

// Helper functions
const formatPhoneNumber = (phone) => {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('251')) {
    cleaned = '0' + cleaned.substring(3);
  } else if (cleaned.startsWith('+251')) {
    cleaned = '0' + cleaned.substring(4);
  }
  if (cleaned.startsWith('09') && cleaned.length === 10) {
    return cleaned;
  }
  return cleaned;
};

const getUserByTelegramId = async (telegramId) => {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [telegramId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
};

const WELCOME_BONUS = 500;
const WEB_APP_URL = 'https://bingo-production-2ec6.up.railway.app';

// ============= MAIN MENU (Always accessible) =============
const sendMainMenu = async (chatId, user) => {
  let message = '';
  const buttons = [];

  if (user) {
    message = `🎰 *BINGO* 🎰\n\n👤 *${user.username || 'Player'}*\n💰 *Balance:* ${user.wallet_balance} Birr\n🏆 *Wins:* ${user.total_games_won}\n━━━━━━━━━━━━━━━━━━━━\n\n*Choose an option:*`;
    
    buttons.push([{ text: "🎮 PLAY GAME", web_app: { url: WEB_APP_URL } }]);
    buttons.push([
      { text: "💰 Balance", callback_data: "menu_balance" },
      { text: "📜 History", callback_data: "menu_history" }
    ]);
    buttons.push([
      { text: "💸 Withdraw", callback_data: "menu_withdraw" },
      { text: "❓ Help", callback_data: "menu_help" }
    ]);
  } else {
    message = `🎰 *BINGO* 🎰\n\n🎁 *New users get ${WELCOME_BONUS} Birr FREE!*\n\nTap the button below to register and start playing!`;
    buttons.push([{ text: "📱 REGISTER", callback_data: "start_registration" }]);
    buttons.push([{ text: "❓ Help", callback_data: "menu_help" }]);
  }

  const options = {
    reply_markup: {
      inline_keyboard: buttons,
      resize_keyboard: true
    },
    parse_mode: 'Markdown'
  };
  
  await bot.sendMessage(chatId, message, options);
};

// ============= PERSISTENT MENU BUTTON (Always visible) =============
const sendPersistentMenu = async (chatId) => {
  const options = {
    reply_markup: {
      keyboard: [
        [{ text: "📋 MENU" }]
      ],
      resize_keyboard: true,
      persistent: true
    }
  };
  await bot.sendMessage(chatId, "Tap MENU anytime to see options:", options);
};

// ============= WELCOME MESSAGE (When user first opens bot) =============
const sendWelcome = async (chatId, user) => {
  if (user) {
    await sendMainMenu(chatId, user);
  } else {
    const welcomeMessage = `🎰 *Welcome to BINGO!* 🎰\n\n🎁 *New users get ${WELCOME_BONUS} Birr FREE!*\n\nTap the button below to get started.`;
    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎮 START PLAYING", callback_data: "start_registration" }],
          [{ text: "❓ Help", callback_data: "menu_help" }]
        ]
      },
      parse_mode: 'Markdown'
    };
    await bot.sendMessage(chatId, welcomeMessage, options);
    await sendPersistentMenu(chatId);
  }
};

// ============= BOT STARTS HERE =============

// When user sends any message (including first interaction)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Handle the persistent MENU button
  if (text === "📋 MENU") {
    const user = await getUserByTelegramId(msg.from.id);
    await sendMainMenu(chatId, user);
    return;
  }
  
  // Handle commands (backward compatibility)
  if (text && text.startsWith('/')) {
    if (text === '/start') {
      const user = await getUserByTelegramId(msg.from.id);
      await sendWelcome(chatId, user);
    }
    return;
  }
  
  if (msg.contact) return;
  
  // Handle registration password
  if (registrationSteps.has(chatId)) {
    const stepData = registrationSteps.get(chatId);
    
    if (stepData.step === 'password' && text) {
      if (text.length < 6) {
        await bot.sendMessage(chatId, '❌ Password must be at least 6 characters. Try again:');
        return;
      }
      
      try {
        const hashedPassword = await hashPassword(text);
        
        const result = await pool.query(
          `INSERT INTO users (telegram_id, username, phone, password_hash, wallet_balance, total_bonus_won) 
           VALUES ($1, $2, $3, $4, $5, $6) 
           RETURNING id`,
          [stepData.telegramId, stepData.username || stepData.telegramId.toString(), stepData.phone, hashedPassword, WELCOME_BONUS, WELCOME_BONUS]
        );
        
        await pool.query(
          `INSERT INTO wallet_transactions (user_id, amount, type, status, description)
           VALUES ($1, $2, 'bonus', 'completed', $3)`,
          [result.rows[0].id, WELCOME_BONUS, `Welcome bonus - ${WELCOME_BONUS} Birr`]
        );
        
        const newUser = await getUserByTelegramId(stepData.telegramId);
        await bot.sendMessage(chatId, `✅ *Registration Successful!*\n\n📱 Phone: ${stepData.phone}\n🎁 Bonus: ${WELCOME_BONUS} Birr\n\n🌐 Login: ${WEB_APP_URL}/login`, { parse_mode: 'Markdown' });
        await sendMainMenu(chatId, newUser);
        registrationSteps.delete(chatId);
        
      } catch (error) {
        console.error('Registration error:', error);
        await bot.sendMessage(chatId, '❌ Registration failed. Tap MENU to try again.');
        registrationSteps.delete(chatId);
        await sendPersistentMenu(chatId);
      }
    }
    return;
  }
  
  // Handle withdrawal amount
  if (withdrawalSteps.has(chatId) && text) {
    const amount = parseFloat(text);
    const session = withdrawalSteps.get(chatId);
    
    if (isNaN(amount) || amount < 10) {
      await bot.sendMessage(chatId, '❌ Minimum withdrawal is 10 Birr. Try again:');
      return;
    }
    
    const user = await getUserByTelegramId(msg.from.id);
    const maxWithdraw = user.wallet_balance - 10;
    
    if (amount > user.wallet_balance) {
      await bot.sendMessage(chatId, `❌ Insufficient balance. Your balance: ${user.wallet_balance} Birr`);
      withdrawalSteps.delete(chatId);
      await sendMainMenu(chatId, user);
      return;
    }
    
    if (amount > maxWithdraw) {
      await bot.sendMessage(chatId, `❌ Maximum withdrawal: ${maxWithdraw} Birr (must leave 10 Birr)`);
      return;
    }
    
    await pool.query(
      `INSERT INTO withdrawal_requests (user_id, amount, phone, status)
       VALUES ($1, $2, $3, 'pending')`,
      [user.id, amount, user.phone]
    );
    
    await bot.sendMessage(chatId, `✅ *Withdrawal Request Submitted!*\n\n💰 Amount: ${amount} Birr\n📊 Status: Pending\n\nAdmin will process within 24 hours.`, { parse_mode: 'Markdown' });
    withdrawalSteps.delete(chatId);
    await sendMainMenu(chatId, user);
  }
});

// Callback query handler (for button clicks)
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const telegramId = callbackQuery.from.id;
  const data = callbackQuery.data;
  
  const user = await getUserByTelegramId(telegramId);
  await bot.answerCallbackQuery(callbackQuery.id);
  
  switch (data) {
    case 'menu_balance':
      if (user) {
        await bot.sendMessage(chatId, `💰 *Your Balance*\n\n💵 *Current:* ${user.wallet_balance} Birr\n🏆 *Wins:* ${user.total_games_won}\n🎁 *Bonus:* ${user.total_bonus_won} Birr`, { parse_mode: 'Markdown' });
        await sendMainMenu(chatId, user);
      } else {
        await sendMainMenu(chatId, null);
      }
      break;
      
    case 'menu_history':
      if (user) {
        const games = await pool.query(
          `SELECT g.*, r.name as room_name
           FROM games g
           JOIN game_rooms r ON r.id = g.room_id
           LEFT JOIN player_cartelas pc ON pc.game_id = g.id AND pc.user_id = $1
           WHERE g.status = 'completed' AND pc.user_id IS NOT NULL
           ORDER BY g.ended_at DESC
           LIMIT 5`,
          [user.id]
        );
        
        if (games.rows.length === 0) {
          await bot.sendMessage(chatId, '📭 No games played yet. Tap PLAY GAME to start!');
        } else {
          let history = `📜 *Recent Games*\n\n`;
          for (const game of games.rows) {
            const date = new Date(game.ended_at).toLocaleDateString();
            const isWinner = game.winners && JSON.parse(game.winners).some(w => w.userId === user.id);
            history += `• ${game.room_name} - ${date} - ${isWinner ? '🏆 WON' : '❌ LOST'}\n`;
          }
          await bot.sendMessage(chatId, history, { parse_mode: 'Markdown' });
        }
        await sendMainMenu(chatId, user);
      } else {
        await sendMainMenu(chatId, null);
      }
      break;
      
    case 'menu_withdraw':
      if (user) {
        if (user.wallet_balance < 10) {
          await bot.sendMessage(chatId, '❌ Minimum withdrawal is 10 Birr.');
          await sendMainMenu(chatId, user);
          return;
        }
        const maxWithdraw = user.wallet_balance - 10;
        withdrawalSteps.set(chatId, { userId: user.id, phone: user.phone });
        await bot.sendMessage(chatId, `💸 *Withdrawal*\n\n💰 Balance: ${user.wallet_balance} Birr\n📱 Phone: ${user.phone || 'Not set'}\n\n*Max withdrawal:* ${maxWithdraw} Birr\n\nSend the amount you want to withdraw:`, { parse_mode: 'Markdown' });
      } else {
        await sendMainMenu(chatId, null);
      }
      break;
      
    case 'menu_help':
      const helpMessage = `❓ *Help*\n\n*How to Play:*\n1. Tap PLAY GAME\n2. Choose a room\n3. Select lucky numbers\n4. Numbers are called automatically\n5. Win when you get BINGO!\n\n*Need Help?*\nContact support: @BingoLastSupport`;
      await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
      await sendMainMenu(chatId, user);
      break;
      
    case 'start_registration':
      if (user) {
        await sendMainMenu(chatId, user);
        return;
      }
      registrationSteps.set(chatId, { step: 'phone', telegramId: telegramId, username: callbackQuery.from.username || '' });
      await bot.sendMessage(chatId, '📱 *Register*\n\nShare your phone number to create an account:', {
        reply_markup: {
          keyboard: [[{ text: "📱 Share Phone Number", request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true
        },
        parse_mode: 'Markdown'
      });
      break;
  }
});

// Contact handler for registration
bot.on('contact', async (msg) => {
  const chatId = msg.chat.id;
  if (!registrationSteps.has(chatId)) return;
  
  const stepData = registrationSteps.get(chatId);
  if (stepData.step !== 'phone') return;
  
  const formattedPhone = formatPhoneNumber(msg.contact.phone_number);
  if (!/^09[0-9]{8}$/.test(formattedPhone)) {
    await bot.sendMessage(chatId, '❌ Invalid phone number. Use format: 0912345678');
    registrationSteps.delete(chatId);
    await sendMainMenu(chatId, null);
    return;
  }
  
  stepData.phone = formattedPhone;
  stepData.step = 'password';
  registrationSteps.set(chatId, stepData);
  
  await bot.sendMessage(chatId, '✅ Phone number received!\n\n🔐 Create a password (min 6 characters):', { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
});

console.log('🤖 Telegram bot is ready!');

module.exports = bot;