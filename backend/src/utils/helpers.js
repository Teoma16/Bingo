const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Hash password
const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

// Compare password
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Generate JWT token
const generateToken = (userId, telegramId) => {
  return jwt.sign(
    { userId, telegramId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Generate Bingo cartela (5x5 ticket)
const generateCartela = () => {
  const cartela = [];
  
  // B: 1-15, I: 16-30, N: 31-45, G: 46-60, O: 61-75
  const ranges = [
    { min: 1, max: 15 },   // B
    { min: 16, max: 30 },  // I
    { min: 31, max: 45 },  // N
    { min: 46, max: 60 },  // G
    { min: 61, max: 75 }   // O
  ];
  
  for (let col = 0; col < 5; col++) {
    const column = [];
    const numbers = [];
    
    // Generate 5 unique numbers for each column
    while (numbers.length < 5) {
      const num = Math.floor(Math.random() * (ranges[col].max - ranges[col].min + 1)) + ranges[col].min;
      if (!numbers.includes(num)) {
        numbers.push(num);
      }
    }
    
    numbers.sort((a, b) => a - b);
    
    for (let row = 0; row < 5; row++) {
      column.push(numbers[row]);
    }
    
    cartela.push(column);
  }
  
  // Set free space (center)
  cartela[2][2] = 'FREE';
  
  return cartela;
};

// Generate all 100 pre-defined cartelas
const generateAllCartelas = () => {
  const cartelas = [];
  for (let i = 1; i <= 100; i++) {
    cartelas.push({
      lucky_number: i,
      cartela_data: generateCartela()
    });
  }
  return cartelas;
};

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  generateCartela,
  generateAllCartelas
};