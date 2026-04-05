// frontend/src/pages/SelectionPage.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import axios from 'axios';
import DepositModal from '../components/DepositModal';
import WithdrawalModal from '../components/WithdrawalModal';
import './SelectionPage.css';

function SelectionPage() {
  const { user, updateBalance } = useAuth();
  const { socket, isConnected, on, off } = useSocket();
  const navigate = useNavigate();
  
  const [selectedNumbers, setSelectedNumbers] = useState([]);
  const [takenNumbers, setTakenNumbers] = useState([]);
  const [players, setPlayers] = useState([]);
  const [pool, setPool] = useState(0);
  const [countdown, setCountdown] = useState(null);
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previewCartelas, setPreviewCartelas] = useState([]);
  const [balance, setBalance] = useState(user?.wallet_balance || 0);
  const [transactions, setTransactions] = useState([]);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  const API_URL = '/api';
  const ENTRY_FEE = 10;
  const WINNER_PERCENTAGE = 78.75;

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/game/current`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setGame(response.data.game);
      setPlayers(response.data.players || []);
      setPool(response.data.game?.total_pool || 0);
      
      if (response.data.cartelas && response.data.cartelas.length > 0) {
        setSelectedNumbers(response.data.cartelas.map(c => c.lucky_number));
      }
      
      if (response.data.game?.status === 'active') {
        navigate('/gameplay');
      }
    } catch (error) {
      console.error('Fetch error:', error);
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
      console.log('Fetched taken numbers:', response.data.takenNumbers);
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
      console.error('Balance error:', error);
    }
  };

  const fetchCartelaPreview = async (number) => {
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
      return { number, cartela };
    } catch (error) {
      console.error('Preview error:', error);
      return null;
    }
  };

  const handleNumberClick = async (number) => {
    if (countdown !== null && countdown > 0) {
      alert('Game starting soon! Cannot change selection.');
      return;
    }
    
    if (takenNumbers.includes(number) && !selectedNumbers.includes(number)) {
      alert(`Number ${number} is already taken by another player!`);
      return;
    }
    
    if (selectedNumbers.includes(number)) {
      await updateSelection(selectedNumbers.filter(n => n !== number));
      return;
    }
    
    if (selectedNumbers.length >= 2) {
      alert('Maximum 2 cartelas per player!');
      return;
    }
    
    await updateSelection([...selectedNumbers, number]);
  };

  const updateSelection = async (numbers) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/game/update-selection`,
        { luckyNumbers: numbers },
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      
      setSelectedNumbers(numbers);
      
      // Update preview cartelas
      const newPreviews = [];
      for (const number of numbers) {
        const preview = await fetchCartelaPreview(number);
        if (preview) newPreviews.push(preview);
      }
      setPreviewCartelas(newPreviews);
      
      // Refresh data
      fetchData();
      fetchBalance();
      
    } catch (error) {
      console.error('Update error:', error);
      alert(error.response?.data?.error || 'Update failed');
    }
  };

  const calculateReward = () => {
    if (!pool || pool <= 0) return '0.00';
    return ((pool * WINNER_PERCENTAGE) / 100).toFixed(2);
  };

  // Initial data fetch
  useEffect(() => {
    fetchData();
    fetchBalance();
  }, []);

  // Poll for taken numbers every 2 seconds
  useEffect(() => {
    if (!game?.id) return;
    
    const interval = setInterval(() => {
      fetchTakenNumbers();
    }, 2000);
    
    return () => clearInterval(interval);
  }, [game?.id]);

  // Socket events for real-time updates
  useEffect(() => {
    if (!socket) return;
    
    // Join the game room
    if (game?.id) {
      socket.emit('join_game_room', { gameId: game.id });
    }
    
    // Listen for taken numbers updates from backend
    const handleTakenNumbersUpdate = (data) => {
      console.log('Taken numbers update from socket:', data);
      if (data.takenNumbers) {
        setTakenNumbers(data.takenNumbers);
      }
    };
    
    // Listen for countdown
    const handleCountdown = (data) => {
      console.log('Countdown received:', data.seconds);
      setCountdown(data.seconds);
    };
    
    // Listen for game start
    const handleGameStart = () => {
      console.log('Game starting!');
      navigate('/gameplay');
    };
    
    socket.on('taken_numbers_update', handleTakenNumbersUpdate);
    socket.on('countdown', handleCountdown);
    socket.on('game_starting', handleGameStart);
    
    return () => {
      socket.off('taken_numbers_update', handleTakenNumbersUpdate);
      socket.off('countdown', handleCountdown);
      socket.off('game_starting', handleGameStart);
    };
  }, [socket, game?.id]);

  if (loading) {
    return (
      <div className="selection-loading">
        <div className="loader"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="selection-page">
      <header className="selection-header">
        <h1>BINGO</h1>
        <div className="header-right">
          <span className="balance">💰 {balance} Birr</span>
          <span className={`status ${isConnected ? 'online' : 'offline'}`}></span>
        </div>
      </header>

      <div className="selection-status">
        {countdown !== null && countdown > 0 ? (
          <div className="countdown-display">
            <span className="countdown-label">⏰ Game starts in:</span>
            <span className="countdown-number">{countdown}s</span>
          </div>
        ) : (
          <div className="waiting-display">
            <span>⏳ Waiting for players... ({players.length}/2 players)</span>
          </div>
        )}
        <div className="reward-display">🏆 Winner gets: {calculateReward()} Birr</div>
      </div>

      <div className="selection-area">
        <div className="selection-info">
          <h3>Select Your Lucky Numbers (1-2)</h3>
          <p>Selected: {selectedNumbers.length}/2</p>
        </div>

        <div className="numbers-grid">
          {Array.from({ length: 100 }, (_, i) => i + 1).map(number => {
            const isSelected = selectedNumbers.includes(number);
            const isTaken = takenNumbers.includes(number) && !isSelected;
            return (
              <button
                key={number}
                className={`number-btn ${isSelected ? 'selected' : ''} ${isTaken ? 'taken' : ''}`}
                onClick={() => handleNumberClick(number)}
                disabled={isTaken}
              >
                {number}
              </button>
            );
          })}
        </div>

        {previewCartelas.length > 0 && (
          <div className="cartelas-preview-section">
            <h3>Your Cartelas</h3>
            <div className="cartelas-preview-container">
              {previewCartelas.map((preview) => (
                <div key={preview.number} className="cartela-preview-card">
                  <div className="preview-number">Lucky #{preview.number}</div>
                  <div className="preview-card-content">
                    <div className="preview-header-row">B I N G O</div>
                    {[0, 1, 2, 3, 4].map(row => (
                      <div key={row} className="preview-row">
                        {[0, 1, 2, 3, 4].map(col => {
                          const num = preview.cartela[col]?.[row];
                          return (
                            <div key={col} className="preview-cell">
                              {num === 'FREE' ? '⭐' : num}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="preview-note">
              Click selected number again to remove
            </div>
          </div>
        )}
      </div>

      <nav className="bottom-nav">
        <div className="nav-item" onClick={() => setShowDepositModal(true)}>
          <span className="nav-icon">💰</span>
          <span className="nav-label">Deposit</span>
        </div>
        <div className="nav-item" onClick={() => setShowWithdrawalModal(true)}>
          <span className="nav-icon">💸</span>
          <span className="nav-label">Withdraw</span>
        </div>
        <div className="nav-item" onClick={() => setShowHistory(!showHistory)}>
          <span className="nav-icon">📜</span>
          <span className="nav-label">History</span>
        </div>
        <div className="nav-item" onClick={() => window.open('https://t.me/luckybingowinnerBot', '_blank')}>
          <span className="nav-icon">📞</span>
          <span className="nav-label">Support</span>
        </div>
      </nav>

      {showHistory && (
        <div className="history-panel" onClick={() => setShowHistory(false)}>
          <div className="history-content" onClick={e => e.stopPropagation()}>
            <button className="history-close" onClick={() => setShowHistory(false)}>×</button>
            <h3>Transaction History</h3>
            <div className="history-list">
              {transactions.length === 0 ? (
                <p>No transactions yet</p>
              ) : (
                transactions.slice(0, 10).map(tx => (
                  <div key={tx.id} className="history-item">
                    <span>{new Date(tx.created_at).toLocaleString()}</span>
                    <span className={tx.amount > 0 ? 'positive' : 'negative'}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount} Birr
                    </span>
                    <span className="history-type">{tx.type}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <DepositModal isOpen={showDepositModal} onClose={() => setShowDepositModal(false)} onSuccess={() => { fetchBalance(); }} />
      <WithdrawalModal isOpen={showWithdrawalModal} onClose={() => setShowWithdrawalModal(false)} balance={balance} onSuccess={() => { fetchBalance(); }} />
    </div>
  );
}

export default SelectionPage;