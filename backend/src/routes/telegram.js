const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { hashPassword, generateToken } = require('../utils/helpers');

// Webhook endpoint for Telegram (if using webhooks instead of polling)
router.post('/webhook', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.sendStatus(200);
    }
    
    const chatId = message.chat.id;
    const text = message.text;
    
    // Handle /start command
    if (text === '/start') {
      // This would be handled by the bot polling method
      // For webhook, we'd send a response here
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Telegram webhook error:', error);
    res.sendStatus(500);
  }
});

// Get Telegram bot info
router.get('/bot-info', async (req, res) => {
  try {
    res.json({
      bot_username: process.env.TELEGRAM_BOT_USERNAME || 'YourBingoBot',
      bot_token_configured: !!process.env.TELEGRAM_BOT_TOKEN
    });
  } catch (error) {
    console.error('Get bot info error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;