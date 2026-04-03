// frontend/src/pages/SelectionPage.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import axios from 'axios';
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
  const [viewingCartela, setViewingCartela] = useState(null);
  const [balance, setBalance] = useState(user?.wallet_balance || 0);
  
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
      
      // Check if game is active - navigate to gameplay
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
      if (updateBalance) updateBalance(response.data.balance);
    } catch (error) {
      console.error('Balance error:', error);
    }
  };

  const handleNumberClick = async (number) => {
    if (takenNumbers.includes(number) && !selectedNumbers.includes(number)) {
      alert(`Number ${number} is already taken!`);
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
    
    // Show preview
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
      setViewingCartela({ number, cartela });
    } catch (error) {
      console.error('Preview error:', error);
    }
  };

  const confirmSelection = async () => {
    if (!viewingCartela) return;
    await updateSelection([...selectedNumbers, viewingCartela.number]);
    setViewingCartela(null);
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

  useEffect(() => {
    if (!socket) return;
    
    const unsubscribeCountdown = on('countdown', (data) => setCountdown(data.seconds));
    const unsubscribeGameStart = on('game_starting', () => {
      navigate('/gameplay');
    });
    const unsubscribeUpdate = on('game_update', () => {
      fetchData();
      fetchTakenNumbers();
    });
    
    return () => {
      unsubscribeCountdown();
      unsubscribeGameStart();
      unsubscribeUpdate();
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
      <header className="selection-header">
        <h1>🎰 BINGO</h1>
        <div className="header-right">
          <span className="balance">💰 {balance} Birr</span>
          <span className={`status ${isConnected ? 'online' : 'offline'}`}></span>
        </div>
      </header>

      <div className="selection-status">
        {countdown > 0 ? (
          <div className="countdown">⏰ Game starts in: {countdown}s</div>
        ) : (
          <div className="waiting">⏳ Waiting for players... ({players.length} players)</div>
        )}
        <div className="reward">🏆 Winner gets: {calculateReward()} Birr</div>
      </div>

      <div className="selection-area">
        <div className="selection-info">
          <h3>Select Your Lucky Numbers (1-2)</h3>
          <p>Selected: {selectedNumbers.length}/2</p>
          {selectedNumbers.length > 0 && (
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
                disabled={isTaken}
              >
                {number}
              </button>
            );
          })}
        </div>
      </div>

      {viewingCartela && (
        <div className="preview-modal" onClick={() => setViewingCartela(null)}>
          <div className="preview-content" onClick={e => e.stopPropagation()}>
            <button className="close" onClick={() => setViewingCartela(null)}>×</button>
            <h3>Lucky Number {viewingCartela.number}</h3>
            <div className="preview-card">
              <div className="preview-header">B I N G O</div>
              {[0, 1, 2, 3, 4].map(row => (
                <div key={row} className="preview-row">
                  {[0, 1, 2, 3, 4].map(col => {
                    const num = viewingCartela.cartela[col]?.[row];
                    return (
                      <div key={col} className="preview-cell">
                        {num === 'FREE' ? '⭐' : num}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <button className="confirm-btn" onClick={confirmSelection}>Select This Cartela</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SelectionPage;