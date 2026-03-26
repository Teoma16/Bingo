import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import axios from 'axios';
import BingoBoard from '../components/BingoBoard';
import './GameRoom.css';

function GameRoom() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, updateBalance } = useAuth();
  const { socket, isConnected, on, emit } = useSocket();
  
  const [game, setGame] = useState(null);
  const [cartelas, setCartelas] = useState(location.state?.cartelas || []);
  const [calledNumbers, setCalledNumbers] = useState([]);
  const [countdown, setCountdown] = useState(null);
  const [gameActive, setGameActive] = useState(false);
  const [winner, setWinner] = useState(null);
  const [lastCalled, setLastCalled] = useState(null);
  const [players, setPlayers] = useState([]);
  const [pool, setPool] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [winnerInfo, setWinnerInfo] = useState(null);
  const audioRef = useRef(null);
  const API_URL = '/api';

  // Helper function to safely parse cartela data
  const parseCartelaData = (cartelaData) => {
    if (!cartelaData) return null;
    if (typeof cartelaData === 'string') {
      try {
        return JSON.parse(cartelaData);
      } catch (e) {
        console.error('Error parsing cartela data:', e);
        return null;
      }
    }
    return cartelaData;
  };

  // Bingo letters mapping
  const getLetter = (number) => {
    if (number <= 15) return 'B';
    if (number <= 30) return 'I';
    if (number <= 45) return 'N';
    if (number <= 60) return 'G';
    return 'O';
  };

  // Check if number is marked on a cartela
  const isNumberMarked = (cartela, number) => {
    const markedNumbers = cartela.marked_numbers || [];
    return markedNumbers.includes(number);
  };

  // Leave room
  const leaveRoom = async () => {
    if (gameActive) {
      alert('Cannot leave during active game!');
      return;
    }
    
    if (window.confirm('Are you sure you want to leave this room?')) {
      try {
        const token = localStorage.getItem('token');
        await axios.post(`${API_URL}/game/rooms/${roomId}/leave`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        navigate('/');
      } catch (error) {
        console.error('Leave room error:', error);
        alert('Failed to leave room');
      }
    }
  };

  const calculatePotentialWinning = () => {
    if (!pool || pool <= 0) return '0.00';
    const WINNER_PERCENTAGE = 78.75;
    const winnerShare = (pool * WINNER_PERCENTAGE) / 100;
    return winnerShare.toFixed(2);
  };

  // Fetch game state
  const fetchGameState = async () => {
    if (!location.state?.gameId) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/game/games/${location.state.gameId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('Game state:', response.data);
      setGame(response.data.game);
      setCartelas(response.data.cartelas || []);
      setPlayers(response.data.players || []);
      setPool(response.data.game.total_pool || 0);
      
      if (response.data.game.status === 'active') {
        setGameActive(true);
      }
    } catch (error) {
      console.error('Fetch game error:', error);
      navigate('/');
    }
  };

  // Refresh cartelas periodically
  const refreshCartelas = async () => {
    if (!game?.id) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/game/games/${game.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCartelas(response.data.cartelas || []);
      setPlayers(response.data.players || []);
      setPool(response.data.game.total_pool || 0);
    } catch (error) {
      console.error('Refresh error:', error);
    }
  };

  useEffect(() => {
    if (location.state?.gameId) {
      fetchGameState();
    } else {
      navigate('/');
    }
  }, [location.state]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    if (game?.id) {
      emit('join_game', { gameId: game.id });
    }

    const unsubscribeCountdown = on('countdown', (data) => {
      console.log('Countdown:', data);
      setCountdown(data.seconds);
    });

    const unsubscribeWaiting = on('waiting_for_players', (data) => {
      console.log('Waiting for players:', data);
      setGameActive(false);
      setCountdown(null);
    });

    const unsubscribeGameState = on('game_state', (data) => {
      console.log('Game state received:', data);
      setCalledNumbers(data.calledNumbers || []);
      setGameActive(true);
      setCountdown(null);
    });

    const unsubscribeGameStarting = on('game_starting', (data) => {
      console.log('Game starting:', data);
      setGameActive(true);
      setCountdown(null);
    });

    const unsubscribeNumberCalled = on('number_called', (data) => {
      console.log('Number called:', data);
      setLastCalled({ number: data.number, letter: data.letter });
      setCalledNumbers(data.calledNumbers || []);
      setGameActive(true);
      setCountdown(null);
      setTimeout(() => refreshCartelas(), 100);
    });

    const unsubscribeAutoMarked = on('auto_marked', (data) => {
      console.log('Auto marked:', data);
      setCartelas(prev => prev.map(c => 
        c.id === data.cartelaId 
          ? { ...c, marked_numbers: [...(c.marked_numbers || []), data.number] }
          : c
      ));
    });

    const unsubscribeGameEnded = on('game_ended', (data) => {
      console.log('Game ended:', data);
      setGameActive(false);
      
      if (data.winners && data.winners.length > 0) {
        const isWinner = data.winners.some(w => w.userId === user?.id);
        const winnerNames = data.winners.map(w => w.username || `Player ${w.userId}`);
        
        setWinnerInfo({
          winners: data.winners,
          winnerNames: winnerNames,
          prizeAmount: data.prizeAmount,
          isWinner: isWinner,
          message: data.message || (data.winners.length === 1 ? 'Single Winner!' : `${data.winners.length} Winners!`)
        });
        setShowWinnerModal(true);
        
        setTimeout(() => {
          setShowWinnerModal(false);
          setWinnerInfo(null);
        }, 3000);
      } else {
        setWinnerInfo({
          winners: [],
          winnerNames: [],
          prizeAmount: 0,
          isWinner: false,
          message: 'No winner this game'
        });
        setShowWinnerModal(true);
        
        setTimeout(() => {
          setShowWinnerModal(false);
          setWinnerInfo(null);
        }, 3000);
      }
      
      if (data.winners && data.winners.some(w => w.userId === user?.id) && updateBalance && user) {
        updateBalance((user.wallet_balance || 0) + (data.prizeAmount || 0));
      }
      
      setTimeout(() => {
        navigate('/');
      }, 5000);
    });

    const refreshInterval = setInterval(refreshCartelas, 3000);

    return () => {
      unsubscribeCountdown();
      unsubscribeWaiting();
      unsubscribeGameState();
      unsubscribeGameStarting();
      unsubscribeNumberCalled();
      unsubscribeAutoMarked();
      unsubscribeGameEnded();
      clearInterval(refreshInterval);
    };
  }, [socket, game, user]);

  useEffect(() => {
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="game-loading">
        <div className="loader"></div>
        <p>Loading game...</p>
      </div>
    );
  }

  return (
    <div className="game-room-casino">
      <audio ref={audioRef} src="/sounds/bell.mp3" preload="auto" />
      
      {/* Header */}<h1>🎰 BINGO</h1>
      <header className="game-header-casino">
        <div className="game-info">
          
          <div className="game-stats-casino">
            <div className="stat-casino">💰 Pool: {pool} Birr</div>
				{/*<div className="stat-casino">👥 Players: {players.length}</div>*/}
            <div className="stat-casino">💵 Balance: {user?.wallet_balance || 0} Birr</div>
          </div>
        </div>
        {!gameActive && (
          <button className="btn-leave-casino" onClick={leaveRoom}>
            Exit Room
          </button>
        )}
      </header>

      {/* Game Status */}
      <div className="game-status-casino">
        {gameActive ? (
          <>
            <div className="status-active-casino">🔴 GAME ACTIVE</div>
            <div className="last-called-casino">
              <span className="last-called-label">Last Called:</span>
              <span className="last-called-number">{lastCalled?.letter}{lastCalled?.number}</span>
            </div>
            <div className="potential-win-casino">
              🏆 Win: <strong>{calculatePotentialWinning()} Birr</strong>
            </div>
          </>
        ) : countdown !== null && countdown > 0 ? (
          <>
            <div className="status-waiting-casino">⏰ Game starts in:</div>
            <div className="countdown-number-casino">{countdown}s</div>
            <div className="potential-win-casino">
              🏆 Win: <strong>{calculatePotentialWinning()} Birr</strong>
            </div>
          </>
        ) : (
          <>
            <div className="status-waiting-casino">⏳ Waiting for players...</div>
            <div className="player-requirement">(Need 2+ players)</div>
            <div className="potential-win-casino">
              🏆 Win: <strong>{calculatePotentialWinning()} Birr</strong>
            </div>
          </>
        )}
      </div>
 <div className="called-numbers-casino">
            <h3>Recent Numbers</h3></div>
      {/* Two Column Layout - Side by Side */}
      <div className="game-main-layout-casino">
        {/* Left Column - BINGO Board */}
        <div className="game-left-column-casino">
          <BingoBoard calledNumbers={calledNumbers} />
          
          {/* Recent Numbers */}
         
            <div className="numbers-grid-casino">
              {calledNumbers.slice(-20).reverse().map((num, idx) => (
                <div key={idx} className="called-number-chip-casino">
                  {getLetter(num)}{num}
                </div>
              ))}
            </div>
         
        </div>

        {/* Right Column - Cartelas */}
        <div className="game-right-column-casino">
          <div className="cartelas-container-casino">
            {cartelas.map((cartela, idx) => {
              const cartelaData = parseCartelaData(cartela.cartela_data);
              if (!cartelaData) return null;
              
              return (
                <div key={cartela.id} className="cartela-card-casino">
                  <div className="cartela-header-casino">
                    <h3>Cartela #{idx + 1} (Lucky #{cartela.lucky_number})</h3>
                  </div>
                  
                  <div className="bingo-card-casino">
                    <div className="bingo-header-casino">
                      <div>B</div><div>I</div><div>N</div><div>G</div><div>O</div>
                    </div>
                    
                    {[0, 1, 2, 3, 4].map(row => (
                      <div key={row} className="bingo-row-casino">
                        {[0, 1, 2, 3, 4].map(col => {
                          const number = cartelaData[col]?.[row];
                          const isFree = number === 'FREE';
                          const isMarked = isFree || isNumberMarked(cartela, number);
                          
                          return (
                            <div
                              key={`${col}-${row}`}
                              className={`bingo-cell-casino ${isMarked ? 'marked' : ''} ${isFree ? 'free' : ''}`}
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
      </div>

      {/* Winner Announcement Modal */}
      {showWinnerModal && winnerInfo && (
        <div className="winner-modal-overlay">
          <div className={`winner-modal ${winnerInfo.isWinner ? 'winner' : 'no-winner'}`}>
            {winnerInfo.isWinner ? (
              <>
                <div className="winner-trophy">🏆</div>
                <h2 className="winner-title">YOU WON!</h2>
                <div className="winner-amount">+{winnerInfo.prizeAmount} Birr</div>
                <div className="winner-message">Congratulations!</div>
              </>
            ) : winnerInfo.winners.length > 0 ? (
              <>
                <div className="winner-trophy">🎉</div>
                <h2 className="winner-title">Game Ended!</h2>
                <div className="winner-names">
                  Winner{winnerInfo.winners.length > 1 ? 's' : ''}: 
                  <strong>{winnerInfo.winnerNames.join(', ')}</strong>
                </div>
                <div className="winner-amount">Won {winnerInfo.prizeAmount} Birr</div>
                <div className="winner-message">Better luck next time!</div>
              </>
            ) : (
              <>
                <div className="winner-trophy">😢</div>
                <h2 className="winner-title">No Winner</h2>
                <div className="winner-message">No one got BINGO this game!</div>
                <div className="winner-note">Next game starts soon!</div>
              </>
            )}
            <div className="winner-timer">Closing in 3 seconds...</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GameRoom;