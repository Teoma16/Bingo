import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import axios from 'axios';
import DepositModal from '../components/DepositModal';
import WithdrawalModal from '../components/WithdrawalModal';
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
  const [takenNumbers, setTakenNumbers] = useState([]);
  const [joining, setJoining] = useState(false);
  const [showCartelaPreview, setShowCartelaPreview] = useState(null);
  
  // UI state
  const [activeTab, setActiveTab] = useState('game');
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [balance, setBalance] = useState(user?.wallet_balance || 0);
  const [transactions, setTransactions] = useState([]);
  
  const API_URL = '/api';
  const ENTRY_FEE = 10;
  const WINNER_PERCENTAGE = 78.75;

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
      
      // Update selected numbers from existing cartelas
      if (response.data.cartelas && response.data.cartelas.length > 0) {
        const numbers = response.data.cartelas.map(c => c.lucky_number);
        setSelectedNumbers(numbers);
      } else {
        setSelectedNumbers([]);
      }
      
      if (response.data.game?.status === 'active') {
        setGameActive(true);
      } else {
        setGameActive(false);
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

  const generateCartelaPreview = async (number) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/game/generate-cartela`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ luckyNumber: number })
      });
      const data = await response.json();
      const cartela = typeof data.cartela === 'string' ? JSON.parse(data.cartela) : data.cartela;
      setShowCartelaPreview({ number, cartela });
    } catch (error) {
      console.error('Error generating cartela preview:', error);
    }
  };

  const handleNumberClick = async (number) => {
    // If game is active, cannot select
    if (gameActive) {
      alert('Game is in progress! Please wait for next game.');
      return;
    }
    
    // If number is already taken by another player
    if (takenNumbers.includes(number) && !selectedNumbers.includes(number)) {
      alert(`❌ Lucky number ${number} is already taken by another player!`);
      return;
    }
    
    // If already selected, deselect and leave game
    if (selectedNumbers.includes(number)) {
      await leaveGame();
      return;
    }
    
    // Show preview first
    await generateCartelaPreview(number);
  };

  const confirmSelectCartela = async () => {
    if (!showCartelaPreview) return;
    const number = showCartelaPreview.number;
    
    // If already has 2 cartelas
    if (selectedNumbers.length >= 2) {
      alert('You can only select up to 2 cartelas!');
      setShowCartelaPreview(null);
      return;
    }
    
    // Join/Update game with this number
    await updateGameSelection([...selectedNumbers, number]);
    setShowCartelaPreview(null);
  };

  const updateGameSelection = async (numbers) => {
    if (joining) return;
    setJoining(true);
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/game/update-selection`,
        { luckyNumbers: numbers },
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      
      if (response.data.success) {
        setSelectedNumbers(numbers);
        setCartelas(response.data.cartelas);
        setGame(response.data.game);
        setPool(response.data.game.total_pool);
        fetchBalance();
        fetchGameState();
      } else {
        alert(response.data.message || 'Failed to update selection');
      }
    } catch (error) {
      console.error('Update selection error:', error);
      alert(error.response?.data?.error || 'Failed to update selection');
    } finally {
      setJoining(false);
    }
  };

  const leaveGame = async () => {
    if (gameActive) {
      alert('Cannot leave during active game!');
      return;
    }
    
    if (selectedNumbers.length === 0) return;
    
    if (window.confirm('Leave the game? Your cartela(s) will be removed.')) {
      try {
        const token = localStorage.getItem('token');
        await axios.post(`${API_URL}/game/leave`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setSelectedNumbers([]);
        setCartelas([]);
        fetchGameState();
        fetchBalance();
      } catch (error) {
        console.error('Leave error:', error);
        alert('Failed to leave game');
      }
    }
  };

  const markNumber = (cartelaId, number) => {
    if (!gameActive) return;
    if (emit) emit('mark_number', { gameId: game?.id, cartelaId, number });
  };

  const callBingo = (cartelaId) => {
    if (!gameActive) return;
    if (window.confirm('Are you sure you want to call BINGO?')) {
      if (emit) emit('call_bingo', { gameId: game?.id, cartelaId });
    }
  };

  const toggleMode = (cartelaId, currentMode) => {
    if (emit) emit('toggle_mode', { cartelaId, isAutoMode: !currentMode });
    setCartelas(prev => prev.map(c => 
      c.id === cartelaId ? { ...c, is_auto_mode: !currentMode } : c
    ));
  };

  useEffect(() => {
    fetchGameState();
    fetchBalance();
    
    const interval = setInterval(() => {
      if (game?.id) fetchTakenNumbers();
      fetchGameState();
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);

  // Socket events
  useEffect(() => {
    if (!socket) return;
    
    if (game?.id) emit('join_game', { gameId: game.id });
    
    const unsubscribeCountdown = on('countdown', (data) => setCountdown(data.seconds));
    const unsubscribeWaiting = on('waiting_for_players', () => { 
      setGameActive(false); 
      setCountdown(null);
      fetchGameState();
    });
    const unsubscribeGameState = on('game_state', (data) => { 
      setCalledNumbers(data.calledNumbers || []); 
      setGameActive(true); 
      setCountdown(null);
    });
    const unsubscribeGameStarting = on('game_starting', () => {
      setGameActive(true);
      setCountdown(null);
      fetchGameState();
    });
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
      setCountdown(null);
      fetchBalance();
      setTimeout(() => {
        setSelectedNumbers([]);
        setCartelas([]);
        fetchGameState();
      }, 5000);
    });
    const unsubscribePlayerJoined = on('player_joined', () => {
      fetchGameState();
      fetchTakenNumbers();
    });
    const unsubscribeNumbersTaken = on('numbers_taken', (data) => {
      fetchTakenNumbers();
      fetchGameState();
    });
    
    return () => {
      unsubscribeCountdown();
      unsubscribeWaiting();
      unsubscribeGameState();
      unsubscribeGameStarting();
      unsubscribeNumberCalled();
      unsubscribeAutoMarked();
      unsubscribeNumberMarked();
      unsubscribeGameEnded();
      unsubscribePlayerJoined();
      unsubscribeNumbersTaken();
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

  // BingoBoard Component
  const BingoBoard = () => {
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
  };

  // Show selection mode if game is NOT active AND (no cartelas OR countdown not started)
  // Once game starts (gameActive = true), show gameplay mode
  const showSelectionMode = !gameActive;

  return (
    <div className="game-page">
      {/* Header */}
      <header className="game-header">
        <h1 className="game-title">🎰 BINGO</h1>
        <div className="header-stats">
          <div className="balance-display" onClick={() => setActiveTab('wallet')}>
            💰 {balance} Birr
          </div>
          <div className={`connection-status ${isConnected ? 'online' : 'offline'}`}></div>
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
            <span>⏳ Waiting for players... ({players.length} players)</span>
            <span className="reward">🏆 {calculatePotentialReward()} Birr</span>
          </div>
        )}
      </div>

      {/* Main Game Area */}
      <div className="game-area">
        {showSelectionMode ? (
          // Selection Mode - Show Lucky Numbers
          <div className="selection-mode">
            <div className="selection-header">
              <h3>Select Your Lucky Numbers (1-2)</h3>
              <p>Selected: {selectedNumbers.length}/2</p>
              {selectedNumbers.length > 0 && (
                <button className="btn-leave" onClick={leaveGame}>Leave Game</button>
              )}
            </div>
            <div className="lucky-numbers-grid">
              {Array.from({ length: 100 }, (_, i) => i + 1).map(number => {
                const isSelected = selectedNumbers.includes(number);
                const isTaken = takenNumbers.includes(number) && !isSelected;
                
                return (
                  <button
                    key={number}
                    className={`lucky-btn 
                      ${isSelected ? 'selected' : ''} 
                      ${isTaken ? 'taken' : ''}`}
                    onClick={() => handleNumberClick(number)}
                    disabled={isTaken}
                  >
                    {number}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          // Gameplay Mode - Show Bingo Board and Cartelas
          <div className="gameplay-mode">
            <div className="bingo-board-section">
              <BingoBoard />
            </div>
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

      {/* Cartela Preview Modal */}
      {showCartelaPreview && (
        <div className="cartela-modal" onClick={() => setShowCartelaPreview(null)}>
          <div className="cartela-modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCartelaPreview(null)}>×</button>
            <h3>Lucky Number {showCartelaPreview.number}</h3>
            <div className="bingo-card-preview">
              <div className="bingo-header">B I N G O</div>
              {[0, 1, 2, 3, 4].map(row => (
                <div key={row} className="bingo-row">
                  {[0, 1, 2, 3, 4].map(col => {
                    const number = showCartelaPreview.cartela[col]?.[row];
                    const isFree = number === 'FREE';
                    return (
                      <div key={`${col}-${row}`} className="bingo-cell-preview">
                        {isFree ? '⭐' : number}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <button 
              className="btn-select" 
              onClick={confirmSelectCartela}
              disabled={selectedNumbers.includes(showCartelaPreview.number)}
            >
              {selectedNumbers.includes(showCartelaPreview.number) ? '✓ Selected' : 'Select This Cartela'}
            </button>
          </div>
        </div>
      )}

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
        <div className="nav-item" onClick={() => window.open('https://t.me/YourBingoBot', '_blank')}>
          <span className="nav-icon">📞</span>
          <span className="nav-label">Support</span>
        </div>
      </nav>

      {/* Wallet Sheet */}
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
      <DepositModal isOpen={showDepositModal} onClose={() => setShowDepositModal(false)} onSuccess={() => { fetchBalance(); setActiveTab('game'); }} />
      <WithdrawalModal isOpen={showWithdrawalModal} onClose={() => setShowWithdrawalModal(false)} balance={balance} onSuccess={() => { fetchBalance(); setActiveTab('game'); }} />
    </div>
  );
}

export default GamePage;