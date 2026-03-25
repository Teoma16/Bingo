-- Create database
CREATE DATABASE bingo_db;

-- Connect to database
\c bingo_db;

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(100),
    phone VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    wallet_balance DECIMAL(15,2) DEFAULT 0,
    total_games_played INT DEFAULT 0,
    total_games_won INT DEFAULT 0,
    total_bonus_won DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Wallet transactions table
CREATE TABLE wallet_transactions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    amount DECIMAL(15,2) NOT NULL,
    type VARCHAR(50) NOT NULL, -- deposit, deduction, prize, bonus
    reference VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending', -- pending, completed, failed
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Game rooms table
CREATE TABLE game_rooms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    entry_fee DECIMAL(10,2) NOT NULL,
    commission_percent INT DEFAULT 20,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Games table
CREATE TABLE games (
    id SERIAL PRIMARY KEY,
    room_id INT REFERENCES game_rooms(id),
    status VARCHAR(20) DEFAULT 'waiting', -- waiting, active, completed
    total_pool DECIMAL(15,2) DEFAULT 0,
    total_players INT DEFAULT 0,
    winning_numbers JSONB,
    winners JSONB,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Player cartelas (tickets) table
CREATE TABLE player_cartelas (
    id SERIAL PRIMARY KEY,
    game_id INT REFERENCES games(id),
    user_id INT REFERENCES users(id),
    room_id INT REFERENCES game_rooms(id),
    lucky_number INT NOT NULL, -- 1-100
    cartela_data JSONB NOT NULL, -- The 5x5 bingo card
    is_auto_mode BOOLEAN DEFAULT true,
    is_winner BOOLEAN DEFAULT false,
    marked_numbers JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Daily play bonus tracking
CREATE TABLE daily_play_bonus (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    games_played INT DEFAULT 0,
    bonus_claimed BOOLEAN DEFAULT false,
    bonus_date DATE DEFAULT CURRENT_DATE
);

-- Deposit requests (for manual approval)
CREATE TABLE deposit_requests (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    amount DECIMAL(15,2) NOT NULL,
    transaction_text TEXT,
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
    approved_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP
);

-- Withdrawal requests
CREATE TABLE withdrawal_requests (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    amount DECIMAL(15,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    approved_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP
);

-- Advertisement settings
CREATE TABLE advertisement_settings (
    id SERIAL PRIMARY KEY,
    is_enabled BOOLEAN DEFAULT false,
    image_url TEXT,
    message TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bonus settings (admin configurable)
CREATE TABLE bonus_settings (
    id SERIAL PRIMARY KEY,
    bonus_type VARCHAR(50) NOT NULL, -- daily_play, fast_win
    config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default game rooms
INSERT INTO game_rooms (name, entry_fee) VALUES
('10 Birr Room', 10),
('20 Birr Room', 20),
('50 Birr Room', 50),
('100 Birr Room', 100);

-- Insert default bonus settings
INSERT INTO bonus_settings (bonus_type, config) VALUES
('daily_play', '{"required_games": 200, "bonus_amount": 50, "time_window_start": "06:00", "time_window_end": "18:00"}'),
('fast_win', '{"call_limit": 5, "bonus_percentage": 1000, "night_bonus": {"enabled": true, "start": "22:00", "end": "06:00"}}');
