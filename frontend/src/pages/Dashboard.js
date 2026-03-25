import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import axios from 'axios';
import CartelaSelection from '../components/CartelaSelection';
import DepositModal from '../components/DepositModal';
import WithdrawalModal from '../components/WithdrawalModal'; // Add this import
import './Dashboard.css';

function Dashboard() {
  const { user, logout, updateBalance } = useAuth();
  const { socket, isConnected } = useSocket();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [advertisement, setAdvertisement] = useState(null);
  const [balance, setBalance] = useState(user?.wallet_balance || 0);
  const [transactions, setTransactions] = useState([]);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false); // Add withdrawal modal state
 
  // Cartela selection state
  const [showCartelaSelection, setShowCartelaSelection] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [currentGameId, setCurrentGameId] = useState(null);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

  useEffect(() => {
    fetchRooms();
    fetchBalance();
    fetchAdvertisement();
  }, []);

  // Real-time player count updates
  useEffect(() => {
    if (!socket) return;
    
    const handlePlayerCountUpdate = (data) => {
      console.log('Player count update:', data);
      setRooms(prevRooms => 
        prevRooms.map(room => 
          room.id === data.roomId 
            ? { ...room, current_players: data.playerCount }
            : room
        )
      );
    };
    
    socket.on('player_count_update', handlePlayerCountUpdate);
    
    return () => {
      socket.off('player_count_update', handlePlayerCountUpdate);
    };
  }, [socket]);

  const handleDepositSuccess = () => {
    fetchBalance();
  };

  const handleWithdrawalSuccess = () => {
    fetchBalance();
  };

  const fetchRooms = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No token found, redirecting to login');
        navigate('/login');
        return;
      }
      
      const response = await axios.get(`${API_URL}/game/rooms`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('Rooms fetched:', response.data);
      setRooms(response.data.rooms || []);
    } catch (error) {
      console.error('Fetch rooms error:', error);
      if (error.response?.status === 401) {
        logout();
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchBalance = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      const response = await axios.get(`${API_URL}/wallet/balance`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('Balance fetched:', response.data);
      setBalance(response.data.balance);
      setTransactions(response.data.transactions || []);
      if (updateBalance) updateBalance(response.data.balance);
    } catch (error) {
      console.error('Fetch balance error:', error);
    }
  };

  const fetchAdvertisement = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/advertisement`);
      if (response.data.is_enabled) {
        setAdvertisement(response.data);
        setShowModal(true);
      }
    } catch (error) {
      console.error('Fetch advertisement error:', error);
    }
  };

  const getCurrentGameId = async (roomId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/game/rooms/${roomId}/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return response.data.waitingGame?.id || null;
    } catch (error) {
      console.error('Error getting game ID:', error);
      return null;
    }
  };

  const joinRoom = async (roomId, entryFee) => {
    console.log('Opening cartela selection for room:', roomId);
    const gameId = await getCurrentGameId(roomId);
    setCurrentGameId(gameId);
    setSelectedRoom({ id: roomId, entryFee });
    setShowCartelaSelection(true);
  };

  const handleConfirmCartelas = async (selectedNumbers) => {
    setShowCartelaSelection(false);
    setLoading(true);
    
    try {
      const token = localStorage.getItem('token');
      const cartelaCount = selectedNumbers.length;
      const requiredAmount = selectedRoom.entryFee * cartelaCount;
      
      if (balance < requiredAmount) {
        alert(`❌ Insufficient balance!\n\nRequired: ${requiredAmount} Birr\nYour balance: ${balance} Birr`);
        setLoading(false);
        setSelectedRoom(null);
        setCurrentGameId(null);
        return;
      }
      
      console.log('Joining with cartelas:', selectedNumbers);
      
      const response = await axios.post(
        `${API_URL}/game/rooms/${selectedRoom.id}/join`,
        { 
          cartelaCount: cartelaCount,
          luckyNumbers: selectedNumbers 
        },
        {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('Join response:', response.data);
      
      if (response.data.success) {
        navigate(`/game/${selectedRoom.id}`, { 
          state: { 
            gameId: response.data.game.id,
            cartelas: response.data.cartelas,
            roomId: selectedRoom.id,
            entryFee: selectedRoom.entryFee
          } 
        });
      } else {
        alert(response.data.message || 'Failed to join room');
      }
    } catch (error) {
      console.error('Join error:', error);
      if (error.response) {
        alert(`❌ Server error: ${error.response.data.error || 'Unknown error'}`);
      } else if (error.request) {
        alert('❌ Cannot connect to server.');
      } else {
        alert(`❌ Error: ${error.message}`);
      }
    } finally {
      setLoading(false);
      setSelectedRoom(null);
      setCurrentGameId(null);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeModal = () => {
    setShowModal(false);
  };

  if (loading && rooms.length === 0) {
    return (
      <div className="dashboard">
        <div className="loading-container">
          <div className="loader"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Advertisement Modal */}
      {showModal && advertisement && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}>×</button>
            {advertisement.image_url && (
              <img src={advertisement.image_url} alt="Advertisement" className="modal-image" />
            )}
            <p className="modal-message">{advertisement.message}</p>
            <button className="btn-primary" onClick={closeModal}>Close</button>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      <DepositModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        onSuccess={handleDepositSuccess}
      />

      {/* Withdrawal Modal */}
      <WithdrawalModal
        isOpen={showWithdrawalModal}
        onClose={() => setShowWithdrawalModal(false)}
        balance={balance}
        onSuccess={handleWithdrawalSuccess}
      />

      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <h1 className="casino-gold"> BINGO</h1>
          <div className="header-info">
            <div className="balance-card">
              <span>💰 Balance:</span>
              <strong>{balance} Birr</strong>
            </div>
            <div className="connection-status"className="balance-card">
              {isConnected ? '🟢 Online' : '🔴 Offline'}
            </div>
            <button onClick={handleLogout} className="btn-logout">Logout</button>
          </div>
        </div>
      </header>

      {/* User Stats */}
      <div className="stats-container">
        <div className="stat-card">
          <div className="stat-icon">🎮</div>
          <div className="stat-info">
            <span>Games Played</span>
            <strong>{user?.total_games_played || 0}</strong>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🏆</div>
          <div className="stat-info">
            <span>Games Won</span>
            <strong>{user?.total_games_won || 0}</strong>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-info">
            <span>Total Winnings</span>
            <strong>{user?.total_winnings || 0} Birr</strong>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🎁</div>
          <div className="stat-info">
            <span>Bonus Won</span>
            <strong>{user?.total_bonus_won || 0} Birr</strong>
          </div>
        </div>
      </div>

      {/* Action Buttons - Deposit & Withdraw */}
      <div className="action-buttons">
        <button className="btn-action btn-deposit" onClick={() => setShowDepositModal(true)}>
          💰 Deposit
        </button>
        <button className="btn-action btn-withdraw" onClick={() => setShowWithdrawalModal(true)}>
          💸 Withdraw
        </button>
      </div>

      {/* Game Rooms */}
      <div className="rooms-container">
        <h2>Select Game Room</h2>
        {rooms.length === 0 ? (
          <div className="loading">No rooms available</div>
        ) : (
         <div className="rooms-grid">
			{rooms.map((room, index) => {
				const colorClasses = ["card-gold", "card-blue", "card-purple", "card-green"];
    
				return (
				  <div 
					key={room.id} 
					className={`room-card ${colorClasses[index % colorClasses.length]}`}
				  >
					<h3 className="gold-text">{room.name}</h3>

					<div className="room-details">
					  <p>Entry Fee: <strong>{room.entry_fee} Birr</strong></p>
					  <p>Current Players: <strong>{room.current_players || 0}</strong></p>
					</div>

					<button onClick={() => joinRoom(room.id, room.entry_fee)}>
					  Join Room
					</button>
				  </div>
				);
  })}
</div>
        )}
      </div>

      {/* Cartela Selection Modal */}
      {showCartelaSelection && selectedRoom && (
        <CartelaSelection
          roomId={selectedRoom.id}
          entryFee={selectedRoom.entryFee}
          onConfirm={handleConfirmCartelas}
          onCancel={() => {
            setShowCartelaSelection(false);
            setSelectedRoom(null);
            setCurrentGameId(null);
          }}
          gameId={currentGameId}
        />
      )}

      {/* Deposit Info */}
      <div className="deposit-info">
        <h3>💰 Deposit Money</h3>
        <p>Send money to Telebirr:</p>
        <div className="telebirr-number">09XX-XXXXXX</div>
        <p className="deposit-note">
          After sending, click the deposit button below above to submit your transaction details
        </p>
        
      </div>

      {/* Recent Transactions */}
      <div className="transactions-container">
        <h3>Recent Transactions</h3>
        <div className="transactions-list">
          {transactions.length === 0 ? (
            <p>No transactions yet</p>
          ) : (
            transactions.slice(0, 5).map(tx => (
              <div key={tx.id} className="transaction-item">
                <span>{new Date(tx.created_at).toLocaleString()}</span>
                <span className={`amount ${tx.amount > 0 ? 'positive' : 'negative'}`}>
                  {tx.amount > 0 ? '+' : ''}{tx.amount} Birr
                </span>
                <span className="type">{tx.type}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;