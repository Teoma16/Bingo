const { pool } = require('../config/database');

// Pre-define all possible numbers for each column
const B_NUMBERS = Array.from({ length: 15 }, (_, i) => i + 1);
const I_NUMBERS = Array.from({ length: 15 }, (_, i) => i + 16);
const N_NUMBERS = Array.from({ length: 15 }, (_, i) => i + 31);
const G_NUMBERS = Array.from({ length: 15 }, (_, i) => i + 46);
const O_NUMBERS = Array.from({ length: 15 }, (_, i) => i + 61);

// Deterministic shuffle using seeded algorithm
function seededShuffle(array, seed) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.abs(Math.sin(seed + i) * 10000) % (i + 1));
    [shuffled[i], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[i]];
  }
  return shuffled;
}

// Generate deterministic cartela for a lucky number
function generateCartela(luckyNumber) {
  const cartela = [[], [], [], [], []];
  
  const seed = luckyNumber * 7919;
  
  const shuffledB = seededShuffle(B_NUMBERS, seed);
  const shuffledI = seededShuffle(I_NUMBERS, seed + 1);
  const shuffledN = seededShuffle(N_NUMBERS, seed + 2);
  const shuffledG = seededShuffle(G_NUMBERS, seed + 3);
  const shuffledO = seededShuffle(O_NUMBERS, seed + 4);
  
  const bColumn = shuffledB.slice(0, 5).sort((a, b) => a - b);
  const iColumn = shuffledI.slice(0, 5).sort((a, b) => a - b);
  const nColumn = shuffledN.slice(0, 5).sort((a, b) => a - b);
  const gColumn = shuffledG.slice(0, 5).sort((a, b) => a - b);
  const oColumn = shuffledO.slice(0, 5).sort((a, b) => a - b);
  
  for (let row = 0; row < 5; row++) {
    cartela[0].push(bColumn[row]);
    cartela[1].push(iColumn[row]);
    cartela[2].push(nColumn[row]);
    cartela[3].push(gColumn[row]);
    cartela[4].push(oColumn[row]);
  }
  
  cartela[2][2] = 'FREE';
  
  return cartela;
}

async function generateAndStoreCartelas() {
  console.log('🎲 Generating 100 pre-defined cartelas...');
  console.time('Generation time');
  
  const cartelas = [];
  
  for (let luckyNumber = 1; luckyNumber <= 100; luckyNumber++) {
    const cartela = generateCartela(luckyNumber);
    cartelas.push({
      lucky_number: luckyNumber,
      cartela_data: JSON.stringify(cartela)
    });
    
    if (luckyNumber % 10 === 0) {
      console.log(`  Generated ${luckyNumber}/100 cartelas...`);
    }
  }
  
  console.timeEnd('Generation time');
  console.log(`✅ Generated ${cartelas.length} cartelas`);
  
  console.log('💾 Storing cartelas in database...');
  console.time('Storage time');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fixed_cartelas (
        id SERIAL PRIMARY KEY,
        lucky_number INTEGER UNIQUE NOT NULL,
        cartela_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.query('TRUNCATE TABLE fixed_cartelas');
    console.log('  Cleared existing cartelas');
    
    const batchSize = 20;
    for (let i = 0; i < cartelas.length; i += batchSize) {
      const batch = cartelas.slice(i, i + batchSize);
      const values = batch.map((_, index) => 
        `($${index * 2 + 1}, $${index * 2 + 2})`
      ).join(',');
      
      const params = batch.flatMap(c => [c.lucky_number, c.cartela_data]);
      
      await pool.query(
        `INSERT INTO fixed_cartelas (lucky_number, cartela_data) 
         VALUES ${values}`,
        params
      );
      
      console.log(`  Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(cartelas.length / batchSize)}`);
    }
    
    console.timeEnd('Storage time');
    
    const result = await pool.query('SELECT COUNT(*) FROM fixed_cartelas');
    console.log(`✅ Success! ${result.rows[0].count} cartelas stored in database`);
    
    // Display sample - safely parse JSON
    const sample = await pool.query(
      'SELECT lucky_number, cartela_data FROM fixed_cartelas LIMIT 3'
    );
    console.log('\n📊 Sample cartelas:');
    sample.rows.forEach(row => {
      // Parse safely
      let cartela;
      try {
        cartela = typeof row.cartela_data === 'string' 
          ? JSON.parse(row.cartela_data) 
          : row.cartela_data;
      } catch (e) {
        console.log(`  Lucky Number ${row.lucky_number}: Error parsing cartela`);
        return;
      }
      
      console.log(`\nLucky Number ${row.lucky_number}:`);
      console.log('  B   I   N   G   O');
      for (let rowIdx = 0; rowIdx < 5; rowIdx++) {
        const b = String(cartela[0]?.[rowIdx] || '?').padStart(2);
        const i = String(cartela[1]?.[rowIdx] || '?').padStart(2);
        const n = cartela[2]?.[rowIdx] === 'FREE' ? 'FREE' : String(cartela[2]?.[rowIdx] || '?').padStart(2);
        const g = String(cartela[3]?.[rowIdx] || '?').padStart(2);
        const o = String(cartela[4]?.[rowIdx] || '?').padStart(2);
        console.log(`  ${b}  ${i}  ${n}  ${g}  ${o}`);
      }
    });
    
  } catch (error) {
    console.error('❌ Error storing cartelas:', error);
  }
  
  await pool.end();
  process.exit();
}

generateAndStoreCartelas();