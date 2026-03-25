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

// Helper function to format phone number
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

// Helper function to get user by telegram ID
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

// Helper function to get user game history
const getUserGameHistory = async (userId, limit = 10) => {
  try {
    const result = await pool.query(
      `SELECT g.*, r.name as room_name
       FROM games g
       JOIN game_rooms r ON r.id = g.room_id
       LEFT JOIN player_cartelas pc ON pc.game_id = g.id AND pc.user_id = $1
       WHERE g.status = 'completed' AND pc.user_id IS NOT NULL
       ORDER BY g.ended_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting game history:', error);
    return [];
  }
};

// Helper function to get user transactions
const getUserTransactions = async (userId, limit = 5) => {
  try {
    const result = await pool.query(
      `SELECT * FROM wallet_transactions 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting transactions:', error);
    return [];
  }
};

// Helper function to create withdrawal request
const createWithdrawalRequest = async (userId, amount, phone) => {
  try {
    const result = await pool.query(
      `INSERT INTO withdrawal_requests (user_id, amount, phone, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [userId, amount, phone]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error creating withdrawal:', error);
    return null;
  }
};

// Helper function to check if user won a game
const didUserWin = (game, userId) => {
  if (!game.winners) return false;
  try {
    let winners;
    if (typeof game.winners === 'string') {
      winners = JSON.parse(game.winners);
    } else {
      winners = game.winners;
    }
    return winners.some(w => w.userId === userId);
  } catch (e) {
    return false;
  }
};

const WELCOME_BONUS = 500;
// Add the Web App button to your menu
const sendWebAppMenu = async (chatId, user) => {
  const webAppUrl = `${process.env.FRONTEND_URL || 'https://bingo-production-2ec6.up.railway.app/'}/?startapp=${user?.id}`;
  
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🎮 OPEN BINGO GAME", web_app: { url: webAppUrl } }],
        [
          { text: "💰 Balance", callback_data: "menu_balance" },
          { text: "💸 Withdraw", callback_data: "menu_withdraw" }
        ],
        [
          { text: "🎮 History", callback_data: "menu_history" },
          { text: "❓ Help", callback_data: "menu_help" }
        ]
      ]
    },
    parse_mode: 'Markdown'
  };
  
  await bot.sendMessage(chatId, "🎰 *BINGO LAST* 🎰\n\nClick the button below to start playing!", options);
};
// Send Main Menu with Inline Buttons
const sendMainMenu = async (chatId, user) => {
  const menuMessage = user ? `
🎰 *BINGO LAST* 🎰

━━━━━━━━━━━━━━━━━━━━
👤 *${user.username || 'Player'}*
💰 *Balance:* ${user.wallet_balance} Birr
🏆 *Wins:* ${user.total_games_won}
━━━━━━━━━━━━━━━━━━━━

*📋 What would you like to do?*
  ` : `
🎰 *BINGO LAST* 🎰

━━━━━━━━━━━━━━━━━━━━
*📋 Welcome to BINGO LAST!*
━━━━━━━━━━━━━━━━━━━━

*What would you like to do?*
  `;

  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💰 Check Balance", callback_data: "menu_balance" }],
        [{ text: "🎮 Game History", callback_data: "menu_history" }],
        [{ text: "💸 Withdraw Money", callback_data: "menu_withdraw" }],
        [{ text: "🎲 Play Now", callback_data: "menu_play" }],
        [{ text: "📞 Support", callback_data: "menu_support" }],
        [{ text: "❓ Help", callback_data: "menu_help" }]
      ],
      resize_keyboard: true
    },
    parse_mode: 'Markdown'
  };
  
  await bot.sendMessage(chatId, menuMessage, options);
};

// Send Simple Menu Button (for bottom keyboard)
const sendMenuButton = async (chatId) => {
  const options = {
    reply_markup: {
      keyboard: [
        [{ text: "📋 Menu" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
  await bot.sendMessage(chatId, "Press the Menu button below to see options:", options);
};

// Only set up event handlers if bot exists
if (bot) {
  bot.on('polling_error', (error) => {
    console.error('❌ Polling error:', error.code, error.message);
  });

  console.log('🤖 Telegram bot is ready!');

  // ============= START COMMAND =============
  bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const username = msg.from.username || '';
  
  const user = await getUserByTelegramId(telegramId);
  
  if (user) {
    // Send Web App menu for registered users
    await sendWebAppMenu(chatId, user);
  } else {
    // Registration flow for new users
    const welcomeMessage = `
🎰 *Welcome to BINGO LAST!* 🎰

🎁 *New users get ${WELCOME_BONUS} Birr FREE!*

Click the button below to register:
    `;
    
    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📱 Register Now", callback_data: "start_registration" }]
        ]
      },
      parse_mode: 'Markdown'
    };
    
    await bot.sendMessage(chatId, welcomeMessage, options);
  }
});

  // ============= MENU BUTTON HANDLER =============
  bot.onText(/📋 Menu/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const user = await getUserByTelegramId(telegramId);
    await sendMainMenu(chatId, user);
  });

  // ============= CALLBACK QUERY HANDLER (Menu Buttons) =============
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const telegramId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    const user = await getUserByTelegramId(telegramId);
    
    if (!user && data !== 'menu_help') {
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Please register first with /start' });
      return;
    }
    
    await bot.answerCallbackQuery(callbackQuery.id);
    
    switch (data) {
      case 'menu_balance':
        await handleBalance(chatId, user);
        break;
      case 'menu_history':
        await handleHistory(chatId, user);
        break;
      case 'menu_withdraw':
        await handleWithdraw(chatId, user);
        break;
      case 'menu_play':
        await handlePlay(chatId);
        break;
      case 'menu_support':
        await handleSupport(chatId);
        break;
      case 'menu_help':
        await handleHelp(chatId);
        break;
      default:
        break;
    }
    
    // Resend menu button after each action
    await sendMenuButton(chatId);
  });

  // ============= COMMAND HANDLERS =============
  
  async function handleBalance(chatId, user) {
    const balanceMessage = `
💰 *Your Balance*

💵 *Current Balance:* ${user.wallet_balance} Birr

📊 *Statistics:*
• Games Played: ${user.total_games_played}
• Games Won: ${user.total_games_won}
• Total Winnings: ${user.total_winnings || 0} Birr
• Bonus Won: ${user.total_bonus_won || 0} Birr
    `;
    await bot.sendMessage(chatId, balanceMessage, { parse_mode: 'Markdown' });
  }

  async function handleHistory(chatId, user) {
    await bot.sendMessage(chatId, '📊 *Fetching your game history...*', { parse_mode: 'Markdown' });
    
    try {
      const games = await getUserGameHistory(user.id, 10);
      const transactions = await getUserTransactions(user.id, 5);
      
      if (games.length === 0 && transactions.length === 0) {
        await bot.sendMessage(chatId, '📭 No game history yet. Start playing to see your stats!');
        return;
      }
      
      let historyMessage = `📊 *Game History*\n\n`;
      
      if (games.length > 0) {
        historyMessage += `*Recent Games:*\n`;
        for (const game of games) {
          const date = new Date(game.ended_at).toLocaleDateString();
          const isWinner = didUserWin(game, user.id);
          historyMessage += `• ${game.room_name} - ${date} - ${isWinner ? '🏆 Won' : '❌ Lost'}\n`;
        }
        historyMessage += `\n`;
      }
      
      if (transactions.length > 0) {
        historyMessage += `*Recent Transactions:*\n`;
        for (const tx of transactions) {
          const date = new Date(tx.created_at).toLocaleDateString();
          const sign = tx.amount > 0 ? '+' : '';
          historyMessage += `• ${tx.type}: ${sign}${tx.amount} Birr (${date})\n`;
        }
      }
      
      await bot.sendMessage(chatId, historyMessage, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('History error:', error);
      await bot.sendMessage(chatId, '❌ Failed to fetch history. Please try again.');
    }
  }

  async function handleWithdraw(chatId, user) {
    if (user.wallet_balance < 10) {
      await bot.sendMessage(chatId, '❌ You need at least 10 Birr to make a withdrawal.');
      return;
    }
    
    const maxWithdraw = user.wallet_balance - 10;
    if (maxWithdraw < 10) {
      await bot.sendMessage(chatId, `❌ You must leave at least 10 Birr. Maximum withdrawal: ${maxWithdraw} Birr`);
      return;
    }
    
    withdrawalSteps.set(chatId, { userId: user.id, phone: user.phone });
    
    const withdrawMessage = `
💸 *Withdrawal Request*

💰 Your balance: ${user.wallet_balance} Birr
📱 Registered phone: ${user.phone || 'Not registered'}

*Rules:*
• Minimum: 10 Birr
• Maximum: ${maxWithdraw} Birr
• Minimum remaining: 10 Birr

Please reply with the amount you want to withdraw:
    `;
    
    await bot.sendMessage(chatId, withdrawMessage, { parse_mode: 'Markdown' });
  }

  async function handlePlay(chatId) {
    const playMessage = `
🎮 *Play Bingo Game!*

🌐 *Website:* ${process.env.FRONTEND_URL || 'http://localhost:3000'}

*Available Rooms:*
• 10 Birr Room
• 20 Birr Room  
• 50 Birr Room
• 100 Birr Room

Good luck! 🍀
    `;
    await bot.sendMessage(chatId, playMessage, { parse_mode: 'Markdown' });
  }

  async function handleSupport(chatId) {
    const supportMessage = `
📞 *Support Center*

📱 Phone: +251-XX-XXX-XXXX
📧 Email: support@bingolast.com
💬 Telegram: @BingoLastSupport

*Support Hours:*
Monday - Friday: 9AM - 6PM
Saturday: 10AM - 4PM

We'll respond within 24 hours!
    `;
    await bot.sendMessage(chatId, supportMessage, { parse_mode: 'Markdown' });
  }

  async function handleHelp(chatId) {
    const helpMessage = `
❓ *Help Menu*

*Commands:*
/start - Main menu & register
/balance - Check balance
/history - Game history
/withdraw - Request withdrawal
/play - Get game link
/support - Contact support
/help - Show this menu

*How to Play:*
1. Login to the website
2. Choose a game room
3. Select 1-2 cartelas
4. Numbers are called every 4 seconds
5. Win automatically when you get BINGO!

Press the "Menu" button below to return.
    `;
    await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
  }

  // ============= CONTACT HANDLER =============
  bot.on('contact', async (msg) => {
    const chatId = msg.chat.id;
    const contact = msg.contact;
    const telegramId = msg.from.id;
    
    if (!registrationSteps.has(chatId)) return;
    
    const stepData = registrationSteps.get(chatId);
    if (stepData.step !== 'phone') return;
    
    let phoneNumber = contact.phone_number;
    const formattedPhone = formatPhoneNumber(phoneNumber);
    
    const phoneRegex = /^09[0-9]{8}$/;
    if (!phoneRegex.test(formattedPhone)) {
      await bot.sendMessage(chatId, '❌ Invalid phone number. Use format: 0912345678');
      const removeKeyboard = { reply_markup: { remove_keyboard: true } };
      await bot.sendMessage(chatId, 'Registration cancelled. Type /start to try again.', removeKeyboard);
      registrationSteps.delete(chatId);
      return;
    }
    
    stepData.phone = formattedPhone;
    stepData.step = 'password';
    registrationSteps.set(chatId, stepData);
    
    const removeKeyboard = { reply_markup: { remove_keyboard: true } };
    await bot.sendMessage(chatId, '✅ Phone number received!', removeKeyboard);
    await bot.sendMessage(chatId, '🔐 *Create Your Password*\n\nType your password (min 6 characters):', { parse_mode: 'Markdown' });
  });

  // ============= TEXT MESSAGE HANDLER =============
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (text && text.startsWith('/')) return;
    if (msg.contact) return;
    if (text === "📋 Menu") return; // Handled above
    
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
          await bot.sendMessage(chatId, `✅ *Registration Successful!*\n\n📱 Phone: ${stepData.phone}\n🎁 Bonus: ${WELCOME_BONUS} Birr\n\n🌐 Login: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`, { parse_mode: 'Markdown' });
          await sendMainMenu(chatId, newUser);
          await sendMenuButton(chatId);
          registrationSteps.delete(chatId);
          
        } catch (error) {
          console.error('Registration error:', error);
          await bot.sendMessage(chatId, '❌ Registration failed. Type /start to try again.');
          registrationSteps.delete(chatId);
        }
      }
      return;
    }
    
    // Handle withdrawal amount
    if (withdrawalSteps.has(chatId) && text) {
      const amount = parseFloat(text);
      
      if (isNaN(amount) || amount <= 0) {
        await bot.sendMessage(chatId, '❌ Please enter a valid amount:');
        return;
      }
      
      const user = await getUserByTelegramId(msg.from.id);
      
      if (amount < 10) {
        await bot.sendMessage(chatId, '❌ Minimum withdrawal is 10 Birr');
        withdrawalSteps.delete(chatId);
        return;
      }
      
      if (amount > user.wallet_balance) {
        await bot.sendMessage(chatId, `❌ Insufficient balance! Your balance is ${user.wallet_balance} Birr`);
        withdrawalSteps.delete(chatId);
        return;
      }
      
      if (user.wallet_balance - amount < 10) {
        await bot.sendMessage(chatId, `❌ You must leave at least 10 Birr. Max withdrawal: ${user.wallet_balance - 10} Birr`);
        withdrawalSteps.delete(chatId);
        return;
      }
      
      const withdrawal = await createWithdrawalRequest(user.id, amount, user.phone);
      
      if (withdrawal) {
        await bot.sendMessage(chatId, `✅ *Withdrawal Request Submitted!*\n\n💰 Amount: ${amount} Birr\n📊 Status: Pending\n\nAdmin will process within 24-48 hours.`, { parse_mode: 'Markdown' });
      } else {
        await bot.sendMessage(chatId, '❌ Failed to submit withdrawal request.');
      }
      
      withdrawalSteps.delete(chatId);
      await sendMainMenu(chatId, user);
      await sendMenuButton(chatId);
    }
  });

} else {
  console.log('⚠️ Telegram bot not initialized. Check TELEGRAM_BOT_TOKEN in .env');
}

module.exports = bot;