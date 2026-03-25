const { Client } = require('pg');

// Your Railway PostgreSQL connection string
const connectionString = 'postgresql://postgres:jtcfLAQHYfToFLwSUuhZMhsILuAKbCwI@shuttle.proxy.rlwy.net:44368/railway';

async function migrate() {
  console.log('🚀 Starting database migration...\n');
  
  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database\n');

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT UNIQUE,
        username VARCHAR(100),
        phone VARCHAR(20),
        password_hash VARCHAR(255),
        wallet_balance DECIMAL(15,2) DEFAULT 0,
        total_games_played INT DEFAULT 0,
        total_games_won INT DEFAULT 0,
        total_bonus_won DECIMAL(15,2) DEFAULT 0,
        total_winnings DECIMAL(15,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ users table created');

    // Create wallet_transactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        amount DECIMAL(15,2),
        type VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pending',
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ wallet_transactions table created');

    // Create game_rooms table
    await client.query(`
      CREATE TABLE IF NOT EXISTS game_rooms (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50),
        entry_fee DECIMAL(10,2),
        commission_percent INT DEFAULT 20,
        is_active BOOLEAN DEFAULT true
      )
    `);
    console.log('✅ game_rooms table created');

    // Create games table
    await client.query(`
      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        room_id INT REFERENCES game_rooms(id),
        status VARCHAR(20) DEFAULT 'waiting',
        total_pool DECIMAL(15,2) DEFAULT 0,
        total_players INT DEFAULT 0,
        winners JSONB,
        started_at TIMESTAMP,
        ended_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ games table created');

    // Create player_cartelas table
    await client.query(`
      CREATE TABLE IF NOT EXISTS player_cartelas (
        id SERIAL PRIMARY KEY,
        game_id INT REFERENCES games(id),
        user_id INT REFERENCES users(id),
        room_id INT REFERENCES game_rooms(id),
        lucky_number INT,
        cartela_data JSONB,
        marked_numbers JSONB DEFAULT '[]',
        is_auto_mode BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ player_cartelas table created');

    // Create fixed_cartelas table
    await client.query(`
      CREATE TABLE IF NOT EXISTS fixed_cartelas (
        id SERIAL PRIMARY KEY,
        lucky_number INTEGER UNIQUE,
        cartela_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ fixed_cartelas table created');

    // Create withdrawal_requests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS withdrawal_requests (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        amount DECIMAL(15,2),
        phone VARCHAR(20),
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ withdrawal_requests table created');

    // Create deposit_requests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS deposit_requests (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        amount DECIMAL(15,2),
        transaction_text TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ deposit_requests table created');

    // Create admin_commission table
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_commission (
        id SERIAL PRIMARY KEY,
        game_id INT REFERENCES games(id),
        room_id INT REFERENCES game_rooms(id),
        total_pool DECIMAL(15,2),
        commission_amount DECIMAL(15,2),
        winner_share DECIMAL(15,2),
        winner_count INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ admin_commission table created');

    // Create bonus_settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS bonus_settings (
        id SERIAL PRIMARY KEY,
        bonus_type VARCHAR(50),
        config JSONB,
        is_active BOOLEAN DEFAULT true
      )
    `);
    console.log('✅ bonus_settings table created');

    // Create advertisement_settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS advertisement_settings (
        id SERIAL PRIMARY KEY,
        is_enabled BOOLEAN DEFAULT false,
        image_url TEXT,
        message TEXT
      )
    `);
    console.log('✅ advertisement_settings table created');

    // Insert default game rooms
    await client.query(`
      INSERT INTO game_rooms (name, entry_fee, commission_percent) 
      SELECT * FROM (VALUES 
        ('10 Birr Room', 10, 20),
        ('20 Birr Room', 20, 20),
        ('50 Birr Room', 50, 20),
        ('100 Birr Room', 100, 20)
      ) AS rooms(name, fee, commission)
      WHERE NOT EXISTS (SELECT 1 FROM game_rooms)
    `);
    console.log('✅ default game rooms inserted');

    // Insert default bonus settings - FIXED JSON FORMAT
   // Check if bonus settings exist first
const bonusCheck = await client.query('SELECT COUNT(*) FROM bonus_settings');
if (bonusCheck.rows[0].count == 0) {
  await client.query(`
    INSERT INTO bonus_settings (bonus_type, config, is_active) 
    VALUES 
      ('daily_play', '{"required_games": 200, "bonus_amount": 50, "time_window_start": "06:00", "time_window_end": "18:00"}'::jsonb, true),
      ('fast_win', '{"call_limit": 5, "bonus_percentage": 1000, "night_bonus": {"enabled": true, "start": "22:00", "end": "06:00"}}'::jsonb, true)
  `);
  console.log('✅ default bonus settings inserted');
} else {
  console.log('⚠️ bonus settings already exist, skipping insertion');
}

    // Insert default advertisement settings
    await client.query(`
      INSERT INTO advertisement_settings (id, is_enabled, image_url, message) 
      VALUES (1, false, '', 'Welcome to BINGO LAST!')
      ON CONFLICT (id) DO NOTHING
    `);
    console.log('✅ default advertisement settings inserted');

    // Check what tables were created
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('\n📊 Tables created:');
    tables.rows.forEach(table => {
      console.log(`   - ${table.table_name}`);
    });

    // Verify game rooms
    const rooms = await client.query('SELECT * FROM game_rooms');
    console.log('\n🎮 Game Rooms:');
    rooms.rows.forEach(room => {
      console.log(`   - ${room.name}: ${room.entry_fee} Birr`);
    });

    console.log('\n🎉 Database migration completed successfully!');

  } catch (error) {
    console.error('\n❌ Error during migration:', error.message);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

migrate();