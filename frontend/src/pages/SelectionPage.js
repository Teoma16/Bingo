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
  const { socket, isConnected, on, emit } = useSocket();
  const navigate = useNavigate();
  
  const [selectedNumbers, setSelectedNumbers] = useState([]);
  const [takenNumbers, setTakenNumbers] = useState([]);
  const [players, setPlayers] = useState([]);
  const [pool, setPool] = useState(0);
  const [countdown, setCountdown] = useState(null);
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previewCartela, setPreviewCartela] = useState(null);
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
      setTakenNumbers(response.data.takenNumbers || []);
    } catch (error) {
      console.error('Error:', error);
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
      return cartela;
    } catch (error) {
      console.error('Preview error:', error);
      return null;
    }
  };

  // Handle number click - toggle selection immediately
  const handleNumberClick = async (number) => {
    if (countdown !== null && countdown > 0) {
      alert('Game starting soon! Cannot change selection.');
      return;
    }
    
    if (takenNumbers.includes(number) && !selectedNumbers.includes(number)) {
      alert(`Number ${number} is already taken!`);
      return;
    }
    
    if (selectedNumbers.includes(number)) {
      // Deselect - remove the number
      await updateSelection(selectedNumbers.filter(n => n !== number));
      setPreviewCartela(null);
      return;
    }
    
    if (selectedNumbers.length >= 2) {
      alert('Maximum 2 cartelas per player!');
      return;
    }
    
    // Show cartela preview at bottom AND auto-select
    const cartela = await fetchCartelaPreview(number);
    setPreviewCartela({ number, cartela });
    
    // Auto-select the number
    await updateSelection([...selectedNumbers, number]);
  };

  const updateSelection = async (numbers) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/game/update-selection`,
        { luckyNumbers: numbers },
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      setSelectedNumbers(numbers);
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

  useEffect(() => {
    fetchData();
    fetchBalance();
    
    const interval = setInterval(() => {
      if (game?.id) fetchTakenNumbers();
      fetchData();
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);

  // Socket events
  useEffect(() => {
    if (!socket) return;
    
    const unsubscribeCountdown = on('countdown', (data) => {
      console.log('Countdown received:', data.seconds);
      setCountdown(data.seconds);
    });
    
    const unsubscribeGameStart = on('game_starting', () => {
      navigate('/gameplay');
    });
    
    const unsubscribeGameUpdate = on('game_update', (data) => {
      fetchData();
      fetchTakenNumbers();
    });
    
    return () => {
      unsubscribeCountdown();
      unsubscribeGameStart();
      unsubscribeGameUpdate();
    };
  }, [socket]);

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
      {/* Header */}
      <header className="selection-header">
        <h1>🎰 BINGO</h1>
        <div className="header-right">
          <span className="balance">💰 {balance} Birr</span>
          <span className={`status ${isConnected ? 'online' : 'offline'}`}></span>
        </div>
      </header>

      {/* Status Bar */}
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

      {/* Selection Area */}
      <div className="selection-area">
        <div className="selection-info">
          <h3>Select Your Lucky Numbers (1-2)</h3>
          <p>Selected: {selectedNumbers.length}/2</p>
          {selectedNumbers.length > 0 && countdown === null && (
            <button className="leave-btn" onClick={() => updateSelection([])}>Leave Game</button>
          )}
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
                disabled={isTaken || (countdown !== null && countdown > 0)}
              >
                {number}
              </button>
            );
          })}
        </div>

        {/* Cartela Preview Section - Shows at BOTTOM after numbers grid */}
        {previewCartela && (
          <div className="cartela-preview-section">
            <div className="preview-header">
              <h3>Your Cartela for Lucky Number {previewCartela.number}</h3>
              <button className="preview-close" onClick={() => setPreviewCartela(null)}>×</button>
            </div>
            <div className="preview-card">
              <div className="preview-header-row">B I N G O</div>
              {[0, 1, 2, 3, 4].map(row => (
                <div key={row} className="preview-row">
                  {[0, 1, 2, 3, 4].map(col => {
                    const num = previewCartela.cartela[col]?.[row];
                    return (
                      <div key={col} className="preview-cell">
                        {num === 'FREE' ? '⭐' : num}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="preview-note">
              ✓ Cartela automatically selected! Click the number again to remove.
            </div>
          </div>
        )}
      </div>

      {/* Footer Navigation */}
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
        <div className="nav-item" onClick={() => window.open('https://t.me/YourBingoBot', '_blank')}>
          <span className="nav-icon">📞</span>
          <span className="nav-label">Support</span>
        </div>
      </nav>

      {/* History Panel */}
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

      {/* Modals */}
      <DepositModal isOpen={showDepositModal} onClose={() => setShowDepositModal(false)} onSuccess={() => { fetchBalance(); }} />
      <WithdrawalModal isOpen={showWithdrawalModal} onClose={() => setShowWithdrawalModal(false)} balance={balance} onSuccess={() => { fetchBalance(); }} />
    </div>
  );
}

export default SelectionPage;