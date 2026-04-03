// frontend/src/pages/GameplayPage.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import axios from 'axios';
import './GameplayPage.css';

function GameplayPage() {
  const { user, updateBalance } = useAuth();
  const { socket, isConnected, on, emit } = useSocket();
  const navigate = useNavigate();
  
  const [game, setGame] = useState(null);
  const [cartelas, setCartelas] = useState([]);
  const [calledNumbers, setCalledNumbers] = useState([]);
  const [lastCalled, setLastCalled] = useState(null);
  const [pool, setPool] = useState(0);
  const [loading, setLoading] = useState(true);
  const [winner, setWinner] = useState(null);
  const [showWinner, setShowWinner] = useState(false);
  
  const API_URL = '/api';
  const WINNER_PERCENTAGE = 78.75;

  const parseCartelaData = (data) => {
    if (!data) return null;
    if (typeof data === 'string') {
      try { return JSON.parse(data); } catch(e) { return null; }
    }
    return data;
  };

  const isNumberMarked = (cartela, number) => {
    const marked = cartela.marked_numbers || [];
    return marked.includes(number);
  };

  const markNumber = (cartelaId, number) => {
    if (emit) emit('mark_number', { gameId: game?.id, cartelaId, number });
  };

  const callBingo = (cartelaId) => {
    if (window.confirm('Call BINGO?')) {
      if (emit) emit('call_bingo', { gameId: game?.id, cartelaId });
    }
  };

  const toggleMode = (cartelaId, currentMode) => {
    if (emit) emit('toggle_mode', { cartelaId, isAutoMode: !currentMode });
    setCartelas(prev => prev.map(c => 
      c.id === cartelaId ? { ...c, is_auto_mode: !currentMode } : c
    ));
  };

  const fetchGameState = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/game/current`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setGame(response.data.game);
      setCartelas(response.data.cartelas || []);
      setPool(response.data.game?.total_pool || 0);
      
      // If game is no longer active, don't navigate immediately - wait for winner announcement
      if (response.data.game?.status !== 'active') {
        // Game ended, but we'll let the socket event handle navigation after winner display
      }
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGameState();
    
    const interval = setInterval(fetchGameState, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!socket) return;
    
    if (game?.id) emit('join_game', { gameId: game.id });
    
    const unsubscribeNumberCalled = on('number_called', (data) => {
      setLastCalled({ number: data.number, letter: data.letter });
      setCalledNumbers(data.calledNumbers || []);
    });
    
    const unsubscribeAutoMarked = on('auto_marked', (data) => {
      setCartelas(prev => prev.map(c => 
        c.id === data.cartelaId ? { ...c, marked_numbers: [...(c.marked_numbers || []), data.number] } : c
      ));
    });
    
    const unsubscribeGameEnded = on('game_ended', (data) => {
      // Show winner announcement
      setWinner(data);
      setShowWinner(true);
      
      // Update balance if user won
      if (data.winners && data.winners.some(w => w.userId === user?.id)) {
        if (updateBalance && user) {
          updateBalance((user.wallet_balance || 0) + (data.prizeAmount || 0));
        }
      }
      
      // Wait 5 seconds then go back to selection page
      setTimeout(() => {
        navigate('/');
      }, 5000);
    });
    
    return () => {
      unsubscribeNumberCalled();
      unsubscribeAutoMarked();
      unsubscribeGameEnded();
    };
  }, [socket, game]);

  const BingoBoard = () => {
    const numbers = {
      B: Array.from({ length: 15 }, (_, i) => i + 1),
      I: Array.from({ length: 15 }, (_, i) => i + 16),
      N: Array.from({ length: 15 }, (_, i) => i + 31),
      G: Array.from({ length: 15 }, (_, i) => i + 46),
      O: Array.from({ length: 15 }, (_, i) => i + 61)
    };
    const isCalled = (num) => calledNumbers.includes(num);
    
    return (
      <div className="gameplay-board">
        <div className="board-header">B I N G O</div>
        {[...Array(15)].map((_, row) => (
          <div key={row} className="board-row">
            <div className={isCalled(numbers.B[row]) ? 'called' : ''}>{numbers.B[row]}</div>
            <div className={isCalled(numbers.I[row]) ? 'called' : ''}>{numbers.I[row]}</div>
            <div className={isCalled(numbers.N[row]) ? 'called' : ''}>{numbers.N[row]}</div>
            <div className={isCalled(numbers.G[row]) ? 'called' : ''}>{numbers.G[row]}</div>
            <div className={isCalled(numbers.O[row]) ? 'called' : ''}>{numbers.O[row]}</div>
          </div>
        ))}
        <div className="board-footer">Called: {calledNumbers.length}/75</div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="gameplay-loading">
        <div className="loader"></div>
        <p>Loading game...</p>
      </div>
    );
  }

  return (
    <div className="gameplay-page">
      {/* Winner Announcement Modal */}
      {showWinner && winner && (
        <div className="winner-modal">
          <div className="winner-content">
            <div className="winner-trophy">🏆</div>
            <h2>GAME OVER!</h2>
            {winner.winners && winner.winners.length > 0 ? (
              <>
                <p className="winner-name">
                  {winner.winners.some(w => w.userId === user?.id) 
                    ? '🎉 YOU WON! 🎉' 
                    : `${winner.winners.map(w => w.username || `Player ${w.userId}`).join(', ')} won!`}
                </p>
                <p className="winner-amount">+{winner.prizeAmount} Birr</p>
                <p className="winner-message">Congratulations!</p>
              </>
            ) : (
              <p className="winner-name">No winner this game!</p>
            )}
            <div className="winner-timer">Returning to lobby in 5 seconds...</div>
          </div>
        </div>
      )}

      <header className="gameplay-header">
        <h1>🎰 BINGO - LIVE</h1>
        <div className="header-stats">
          <span>Last: {lastCalled?.letter}{lastCalled?.number || '--'}</span>
          <span>🏆 {((pool * WINNER_PERCENTAGE) / 100).toFixed(2)} Birr</span>
        </div>
      </header>

      <div className="gameplay-container">
        <div className="board-section">
          <BingoBoard />
        </div>
        <div className="cartelas-section">
          {cartelas.map((cartela, idx) => {
            const data = parseCartelaData(cartela.cartela_data);
            if (!data) return null;
            const isAuto = cartela.is_auto_mode;
            return (
              <div key={cartela.id} className="cartela-card">
                <div className="cartela-header">
                  <span>#{idx + 1} 🍀{cartela.lucky_number}</span>
                  <div className="buttons">
                    <button className={`mode ${isAuto ? 'auto' : 'manual'}`} onClick={() => toggleMode(cartela.id, isAuto)}>
                      {isAuto ? 'Auto' : 'Manual'}
                    </button>
                    <button className="bingo" onClick={() => callBingo(cartela.id)}>BINGO!</button>
                  </div>
                </div>
                <div className="cartela-grid">
                  <div className="grid-header">B I N G O</div>
                  {[0, 1, 2, 3, 4].map(row => (
                    <div key={row} className="grid-row">
                      {[0, 1, 2, 3, 4].map(col => {
                        const num = data[col]?.[row];
                        const isFree = num === 'FREE';
                        const isMarked = isFree || isNumberMarked(cartela, num);
                        return (
                          <div
                            key={col}
                            className={`cell ${isMarked ? 'marked' : ''} ${isFree ? 'free' : ''}`}
                            onClick={() => {
                              if (!isAuto && !isMarked && num !== 'FREE') {
                                markNumber(cartela.id, num);
                              }
                            }}
                          >
                            {isFree ? '⭐' : num}
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
    </div>
  );
}

export default GameplayPage;