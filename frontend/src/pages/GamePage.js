import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import DepositModal from '../components/DepositModal';      // Add this
import WithdrawalModal from '../components/WithdrawalModal'; // Add this
import axios from 'axios';
import './GamePage.css';

function GamePage() {
  const { user, updateBalance } = useAuth();
  const { socket, isConnected, on, emit } = useSocket();
  const navigate = useNavigate();
  
  // Game state
  const [game, setGame] = useState(null);
  const [cartelas, setCartelas] = useState([]);
  const [selectedNumbers, setSelectedNumbers] = useState([]);
  const [calledNumbers, setCalledNumbers] = useState([]);
  const [countdown, setCountdown] = useState(null);
  const [gameActive, setGameActive] = useState(false);
  const [lastCalled, setLastCalled] = useState(null);
  const [players, setPlayers] = useState([]);
  const [pool, setPool] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewingCartela, setViewingCartela] = useState(null);
  const [showCartelaModal, setShowCartelaModal] = useState(false);
  const [takenNumbers, setTakenNumbers] = useState([]);
  
  // UI state
  const [activeTab, setActiveTab] = useState('game'); // game, wallet, settings
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [balance, setBalance] = useState(user?.wallet_balance || 0);
  const [transactions, setTransactions] = useState([]);
  
  const API_URL = '/api';
  const ENTRY_FEE = 10;
  const WINNER_PERCENTAGE = 78.75;

  // Helper functions
  const parseCartelaData = (cartelaData) => {
    if (!cartelaData) return null;
    if (typeof cartelaData === 'string') {
      try {
        return JSON.parse(cartelaData);
      } catch (e) {
        return null;
      }
    }
    return cartelaData;
  };

  const getLetter = (number) => {
    if (number <= 15) return 'B';
    if (number <= 30) return 'I';
    if (number <= 45) return 'N';
    if (number <= 60) return 'G';
    return 'O';
  };

  const isNumberMarked = (cartela, number) => {
    const markedNumbers = cartela.marked_numbers || [];
    return markedNumbers.includes(number);
  };

  const calculatePotentialReward = () => {
    if (!pool || pool <= 0) return '0.00';
    const winnerShare = (pool * WINNER_PERCENTAGE) / 100;
    return winnerShare.toFixed(2);
  };

  // Fetch game state
  const fetchGameState = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/game/current`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setGame(response.data.game);
      setCartelas(response.data.cartelas || []);
      setPlayers(response.data.players || []);
      setPool(response.data.game?.total_pool || 0);
      
      if (response.data.game?.status === 'active') {
        setGameActive(true);
      }
    } catch (error) {
      console.error('Fetch game error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTakenNumbers = async () => {
    if (!game?.id) return;
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/game/${game.id}/taken-numbers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTakenNumbers(response.data.takenNumbers || []);
    } catch (error) {
      console.error('Error fetching taken numbers:', error);
    }
  };

  const fetchBalance = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/wallet/balance`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBalance(response.data.balance);
      setTransactions(response.data.transactions || []);
      if (updateBalance) updateBalance(response.data.balance);
    } catch (error) {
      console.error('Fetch balance error:', error);
    }
  };

  // Generate cartela preview
  const generateCartelaForNumber = async (luckyNumber) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/game/generate-cartela`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ luckyNumber })
      });
      const data = await response.json();
      return typeof data.cartela === 'string' ? JSON.parse(data.cartela) : data.cartela;
    } catch (error) {
      console.error('Error generating cartela:', error);
      return null;
    }
  };

  // Select/deselect cartela
  const handleNumberClick = async (number) => {
    if (takenNumbers.includes(number)) {
      alert(`❌ Lucky number ${number} is already taken by another player!`);
      return;
    }
    
    if (selectedNumbers.includes(number)) {
      // Deselect
      setSelectedNumbers(prev => prev.filter(n => n !== number));
    } else {
      // Select (max 2)
      if (selectedNumbers.length >= 2) {
        alert('You can only select up to 2 cartelas!');
        return;
      }
      
      // Show preview
      const cartela = await generateCartelaForNumber(number);
      setViewingCartela({ number, cartela });
      setShowCartelaModal(true);
    }
  };

  const confirmSelectCartela = () => {
    if (!viewingCartela) return;
    
    if (!selectedNumbers.includes(viewingCartela.number)) {
      setSelectedNumbers(prev => [...prev, viewingCartela.number]);
    }
    setShowCartelaModal(false);
    setViewingCartela(null);
  };

  // Join game with selected cartelas
  const joinGame = async () => {
    if (selectedNumbers.length === 0) {
      alert('Please select at least one lucky number!');
      return;
    }
    
    const requiredAmount = ENTRY_FEE * selectedNumbers.length;
    if (balance < requiredAmount) {
      alert(`❌ Insufficient balance!\n\nRequired: ${requiredAmount} Birr\nYour balance: ${balance} Birr`);
      return;
    }
    
    setLoading(true);
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/game/join`,
        { luckyNumbers: selectedNumbers },
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      
      if (response.data.success) {
        setCartelas(response.data.cartelas);
        setGame(response.data.game);
        setPool(response.data.game.total_pool);
        fetchBalance();
      } else {
        alert(response.data.message || 'Failed to join game');
      }
    } catch (error) {
      console.error('Join error:', error);
      alert(error.response?.data?.error || 'Failed to join game');
    } finally {
      setLoading(false);
    }
  };

  // Leave game
  const leaveGame = async () => {
    if (gameActive) {
      alert('Cannot leave during active game!');
      return;
    }
    
    if (window.confirm('Are you sure you want to leave this game?')) {
      try {
        const token = localStorage.getItem('token');
        await axios.post(`${API_URL}/game/leave`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSelectedNumbers([]);
        setCartelas([]);
        setGame(null);
        fetchGameState();
        fetchBalance();
      } catch (error) {
        console.error('Leave error:', error);
        alert('Failed to leave game');
      }
    }
  };

  // Mark number manually
  const markNumber = (cartelaId, number) => {
    if (!gameActive) return;
    if (emit) emit('mark_number', { gameId: game?.id, cartelaId, number });
  };

  // Call BINGO
  const callBingo = (cartelaId) => {
    if (!gameActive) return;
    if (window.confirm('Are you sure you want to call BINGO?')) {
      if (emit) emit('call_bingo', { gameId: game?.id, cartelaId });
    }
  };

  // Toggle auto mode
  const toggleMode = (cartelaId, currentMode) => {
    if (emit) emit('toggle_mode', { cartelaId, isAutoMode: !currentMode });
  };

  useEffect(() => {
    fetchGameState();
    fetchBalance();
    fetchTakenNumbers();
    
    const interval = setInterval(() => {
      if (game?.id) fetchTakenNumbers();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [game?.id]);

  // Socket events
  useEffect(() => {
    if (!socket) return;
    
    if (game?.id) emit('join_game', { gameId: game.id });
    
    const unsubscribeCountdown = on('countdown', (data) => setCountdown(data.seconds));
    const unsubscribeWaiting = on('waiting_for_players', () => { setGameActive(false); setCountdown(null); });
    const unsubscribeGameState = on('game_state', (data) => { setCalledNumbers(data.calledNumbers || []); setGameActive(true); setCountdown(null); });
    const unsubscribeNumberCalled = on('number_called', (data) => {
      setLastCalled({ number: data.number, letter: data.letter });
      setCalledNumbers(data.calledNumbers || []);
      setGameActive(true);
      setCountdown(null);
    });
    const unsubscribeAutoMarked = on('auto_marked', (data) => {
      setCartelas(prev => prev.map(c => 
        c.id === data.cartelaId ? { ...c, marked_numbers: [...(c.marked_numbers || []), data.number] } : c
      ));
    });
    const unsubscribeNumberMarked = on('number_marked', (data) => {
      setCartelas(prev => prev.map(c => 
        c.id === data.cartelaId ? { ...c, marked_numbers: [...(c.marked_numbers || []), data.number] } : c
      ));
    });
    const unsubscribeGameEnded = on('game_ended', (data) => {
      setGameActive(false);
      fetchBalance();
      setTimeout(() => {
        setSelectedNumbers([]);
        setCartelas([]);
        fetchGameState();
      }, 5000);
    });
    
    return () => {
      unsubscribeCountdown();
      unsubscribeWaiting();
      unsubscribeGameState();
      unsubscribeNumberCalled();
      unsubscribeAutoMarked();
      unsubscribeNumberMarked();
      unsubscribeGameEnded();
    };
  }, [socket, game]);

  if (loading) {
    return (
      <div className="game-loading">
        <div className="loader"></div>
        <p>Loading game...</p>
      </div>
    );
  }

  return (
    <div className="game-page">
      {/* Header */}
      <header className="game-header">
        <h1 className="game-title">🎰 BINGO</h1>
        <div className="header-stats">
          <div className="balance-display">
            💰 {balance} Birr
          </div>
          <div className="connection-status">
            {isConnected ? '🟢' : '🔴'}
          </div>
        </div>
      </header>

      {/* Game Status */}
      <div className="game-status">
        {gameActive ? (
          <div className="status-active">
            <span className="live-badge">🔴 LIVE</span>
            <span className="last-number">Last: {lastCalled?.letter}{lastCalled?.number || '--'}</span>
            <span className="reward">🏆 {calculatePotentialReward()} Birr</span>
          </div>
        ) : countdown !== null && countdown > 0 ? (
          <div className="status-countdown">
            <span>⏰ Game starts in:</span>
            <span className="countdown-number">{countdown}s</span>
            <span className="reward">🏆 {calculatePotentialReward()} Birr</span>
          </div>
        ) : (
          <div className="status-waiting">
            <span>⏳ Waiting for players...</span>
            <span className="reward">🏆 {calculatePotentialReward()} Birr</span>
          </div>
        )}
      </div>

      {/* Main Game Area */}
      <div className="game-area">
        {!gameActive && cartelas.length === 0 ? (
          // Selection Mode
          <div className="selection-mode">
            <div className="selection-header">
              <h3>Select Your Lucky Numbers (1-2)</h3>
              <p>Selected: {selectedNumbers.length}/2</p>
            </div>
            <div className="lucky-numbers-grid">
              {Array.from({ length: 100 }, (_, i) => i + 1).map(number => (
                <button
                  key={number}
                  className={`lucky-btn ${selectedNumbers.includes(number) ? 'selected' : ''} ${takenNumbers.includes(number) ? 'taken' : ''}`}
                  onClick={() => handleNumberClick(number)}
                  disabled={takenNumbers.includes(number)}
                >
                  {number}
                </button>
              ))}
            </div>
            <div className="selection-actions">
              <button className="btn-join" onClick={joinGame} disabled={selectedNumbers.length === 0}>
                JOIN GAME ({ENTRY_FEE * selectedNumbers.length} Birr)
              </button>
            </div>
          </div>
        ) : (
          // Gameplay Mode
          <div className="gameplay-mode">
            {/* Bingo Board */}
            <div className="bingo-board-section">
              <BingoBoard calledNumbers={calledNumbers} />
            </div>
            
            {/* Cartelas */}
            <div className="cartelas-section">
              {cartelas.map((cartela, idx) => {
                const cartelaData = parseCartelaData(cartela.cartela_data);
                if (!cartelaData) return null;
                const isAuto = cartela.is_auto_mode;
                
                return (
                  <div key={cartela.id} className="cartela-card">
                    <div className="cartela-header">
                      <span>#{idx + 1} 🍀{cartela.lucky_number}</span>
                      <div className="cartela-buttons">
                        <button className={`mode-btn ${isAuto ? 'auto' : 'manual'}`} onClick={() => toggleMode(cartela.id, isAuto)}>
                          {isAuto ? '🤖 Auto' : '✋ Manual'}
                        </button>
                        <button className="bingo-btn" onClick={() => callBingo(cartela.id)} disabled={!gameActive}>
                          BINGO!
                        </button>
                      </div>
                    </div>
                    <div className="bingo-card">
                      <div className="bingo-header">B I N G O</div>
                      {[0, 1, 2, 3, 4].map(row => (
                        <div key={row} className="bingo-row">
                          {[0, 1, 2, 3, 4].map(col => {
                            const number = cartelaData[col]?.[row];
                            const isFree = number === 'FREE';
                            const isMarked = isFree || isNumberMarked(cartela, number);
                            return (
                              <div
                                key={`${col}-${row}`}
                                className={`bingo-cell ${isMarked ? 'marked' : ''} ${isFree ? 'free' : ''}`}
                                onClick={() => {
                                  if (gameActive && !isAuto && number !== 'FREE' && !isMarked) {
                                    markNumber(cartela.id, number);
                                  }
                                }}
                              >
                                {isFree ? '⭐' : number}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <nav className="bottom-nav">
        <div className={`nav-item ${activeTab === 'game' ? 'active' : ''}`} onClick={() => setActiveTab('game')}>
          <span className="nav-icon">🎮</span>
          <span className="nav-label">Game</span>
        </div>
        <div className={`nav-item ${activeTab === 'wallet' ? 'active' : ''}`} onClick={() => setActiveTab('wallet')}>
          <span className="nav-icon">💰</span>
          <span className="nav-label">Wallet</span>
        </div>
        <div className={`nav-item`} onClick={() => window.open('https://t.me/YourBingoBot', '_blank')}>
          <span className="nav-icon">📞</span>
          <span className="nav-label">Support</span>
        </div>
      </nav>

      {/* Wallet Modal (Bottom Sheet) */}
      {activeTab === 'wallet' && (
        <div className="wallet-sheet">
          <div className="sheet-header">
            <h3>Wallet</h3>
            <button className="close-sheet" onClick={() => setActiveTab('game')}>×</button>
          </div>
          <div className="wallet-balance">
            <span>Balance</span>
            <strong>{balance} Birr</strong>
          </div>
          <div className="wallet-actions">
            <button className="btn-deposit" onClick={() => setShowDepositModal(true)}>Deposit</button>
            <button className="btn-withdraw" onClick={() => setShowWithdrawalModal(true)}>Withdraw</button>
          </div>
          <div className="transaction-history">
            <h4>Recent Transactions</h4>
            {transactions.slice(0, 5).map(tx => (
              <div key={tx.id} className="transaction-row">
                <span>{new Date(tx.created_at).toLocaleDateString()}</span>
                <span className={tx.amount > 0 ? 'positive' : 'negative'}>
                  {tx.amount > 0 ? '+' : ''}{tx.amount} Birr
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showCartelaModal && viewingCartela && (
        <div className="cartela-modal" onClick={() => setShowCartelaModal(false)}>
          <div className="cartela-modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCartelaModal(false)}>×</button>
            <h3>Lucky Number {viewingCartela.number}</h3>
            <div className="bingo-card-preview">
              <div className="bingo-header">B I N G O</div>
              {[0, 1, 2, 3, 4].map(row => (
                <div key={row} className="bingo-row">
                  {[0, 1, 2, 3, 4].map(col => {
                    const number = viewingCartela.cartela[col]?.[row];
                    return (
                      <div key={`${col}-${row}`} className="bingo-cell-preview">
                        {number === 'FREE' ? '⭐' : number}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <button className="btn-select" onClick={confirmSelectCartela}>
              {selectedNumbers.includes(viewingCartela.number) ? '✓ Selected' : 'Select This Cartela'}
            </button>
          </div>
        </div>
      )}

      <DepositModal isOpen={showDepositModal} onClose={() => setShowDepositModal(false)} onSuccess={() => { fetchBalance(); setActiveTab('game'); }} />
      <WithdrawalModal isOpen={showWithdrawalModal} onClose={() => setShowWithdrawalModal(false)} balance={balance} onSuccess={() => { fetchBalance(); setActiveTab('game'); }} />
    </div>
  );
}

// BingoBoard Component (inline)
function BingoBoard({ calledNumbers }) {
  const bingoNumbers = {
    B: Array.from({ length: 15 }, (_, i) => i + 1),
    I: Array.from({ length: 15 }, (_, i) => i + 16),
    N: Array.from({ length: 15 }, (_, i) => i + 31),
    G: Array.from({ length: 15 }, (_, i) => i + 46),
    O: Array.from({ length: 15 }, (_, i) => i + 61)
  };

  const isNumberCalled = (num) => calledNumbers.includes(num);

  return (
    <div className="bingo-board">
      <div className="board-header">B I N G O</div>
      {[...Array(15)].map((_, row) => (
        <div key={row} className="board-row">
          <div className={isNumberCalled(bingoNumbers.B[row]) ? 'called' : ''}>{bingoNumbers.B[row]}</div>
          <div className={isNumberCalled(bingoNumbers.I[row]) ? 'called' : ''}>{bingoNumbers.I[row]}</div>
          <div className={isNumberCalled(bingoNumbers.N[row]) ? 'called' : ''}>{bingoNumbers.N[row]}</div>
          <div className={isNumberCalled(bingoNumbers.G[row]) ? 'called' : ''}>{bingoNumbers.G[row]}</div>
          <div className={isNumberCalled(bingoNumbers.O[row]) ? 'called' : ''}>{bingoNumbers.O[row]}</div>
        </div>
      ))}
      <div className="board-footer">Called: {calledNumbers.length}/75</div>
    </div>
  );
}

export default GamePage;