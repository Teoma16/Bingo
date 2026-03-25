import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import './AdminPanel.css';

function AdminPanel() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('rooms');
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [financials, setFinancials] = useState({});
  const [deposits, setDeposits] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const API_URL = process.env.REACT_APP_API_URL;

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'rooms') {
        const response = await axios.get(`${API_URL}/admin/rooms/stats`);
        setRooms(response.data.stats);
      } else if (activeTab === 'users') {
        const response = await axios.get(`${API_URL}/admin/users`);
        setUsers(response.data.users);
      } else if (activeTab === 'financials') {
        const response = await axios.get(`${API_URL}/admin/reports/financial`);
        setFinancials(response.data);
      } else if (activeTab === 'deposits') {
        const response = await axios.get(`${API_URL}/admin/deposits`);
        setDeposits(response.data.deposits);
      }
    } catch (error) {
      console.error('Fetch data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const approveDeposit = async (depositId) => {
    try {
      await axios.post(`${API_URL}/admin/deposits/${depositId}/approve`);
      fetchData();
      alert('Deposit approved successfully!');
    } catch (error) {
      console.error('Approve deposit error:', error);
      alert('Failed to approve deposit');
    }
  };

  const updateWallet = async (userId, amount, type, description) => {
    try {
      await axios.post(`${API_URL}/admin/users/${userId}/wallet`, {
        amount,
        type,
        description
      });
      fetchData();
      alert('Wallet updated successfully!');
    } catch (error) {
      console.error('Update wallet error:', error);
      alert('Failed to update wallet');
    }
  };

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="loader"></div>
        <p>Loading admin panel...</p>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <header className="admin-header">
        <h1>🎰 Admin Dashboard</h1>
        <div className="admin-user">
          Welcome, {user?.username}
        </div>
      </header>

      <div className="admin-tabs">
        <button 
          className={activeTab === 'rooms' ? 'active' : ''} 
          onClick={() => setActiveTab('rooms')}
        >
          🏠 Rooms
        </button>
        <button 
          className={activeTab === 'users' ? 'active' : ''} 
          onClick={() => setActiveTab('users')}
        >
          👥 Users
        </button>
        <button 
          className={activeTab === 'financials' ? 'active' : ''} 
          onClick={() => setActiveTab('financials')}
        >
          💰 Financials
        </button>
        <button 
          className={activeTab === 'deposits' ? 'active' : ''} 
          onClick={() => setActiveTab('deposits')}
        >
          💵 Deposits
        </button>
        <button 
          className={activeTab === 'bonus' ? 'active' : ''} 
          onClick={() => setActiveTab('bonus')}
        >
          🎁 Bonuses
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'rooms' && (
          <div className="rooms-stats">
            <h2>Room Statistics</h2>
            <div className="rooms-grid">
              {rooms.map(room => (
                <div key={room.room.id} className="room-stat-card glass-card">
                  <h3>{room.room.name}</h3>
                  <div className="room-stat-details">
                    <p>Entry Fee: <strong>{room.room.entry_fee} Birr</strong></p>
                    <p>Current Players: <strong>{room.current_players}</strong></p>
                    <p>Commission: <strong>{room.room.commission_percent}%</strong></p>
                    {room.current_game && (
                      <>
                        <p>Game Status: <strong>{room.current_game.status}</strong></p>
                        <p>Total Pool: <strong>{room.current_game.total_pool} Birr</strong></p>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="users-management">
            <h2>User Management</h2>
            <div className="users-table-container">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Username</th>
                    <th>Telegram ID</th>
                    <th>Balance</th>
                    <th>Games Won</th>
                    <th>Bonus Won</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id}>
                      <td>{user.id}</td>
                      <td>{user.username || 'N/A'}</td>
                      <td>{user.telegram_id}</td>
                      <td className="balance">{user.wallet_balance} Birr</td>
                      <td>{user.total_games_won}</td>
                      <td>{user.total_bonus_won} Birr</td>
                      <td>
                        <button 
                          className="btn-view"
                          onClick={() => setSelectedUser(user)}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'financials' && (
          <div className="financial-reports">
            <h2>Financial Reports</h2>
            <div className="financial-cards">
              <div className="financial-card glass-card">
                <div className="financial-icon">💰</div>
                <div className="financial-info">
                  <span>Total Deposits</span>
                  <strong>{financials.total_deposits || 0} Birr</strong>
                </div>
              </div>
              <div className="financial-card glass-card">
                <div className="financial-icon">🏆</div>
                <div className="financial-info">
                  <span>Total Prizes Paid</span>
                  <strong>{financials.total_prizes || 0} Birr</strong>
                </div>
              </div>
              <div className="financial-card glass-card">
                <div className="financial-icon">💸</div>
                <div className="financial-info">
                  <span>Total Withdrawals</span>
                  <strong>{financials.total_withdrawals || 0} Birr</strong>
                </div>
              </div>
              <div className="financial-card glass-card">
                <div className="financial-icon">📊</div>
                <div className="financial-info">
                  <span>Total Commission</span>
                  <strong>{financials.total_commission || 0} Birr</strong>
                </div>
              </div>
              <div className="financial-card glass-card">
                <div className="financial-icon">🎮</div>
                <div className="financial-info">
                  <span>Total Wins</span>
                  <strong>{financials.total_wins || 0}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'deposits' && (
          <div className="deposits-management">
            <h2>Pending Deposits</h2>
            <div className="deposits-table-container">
              <table className="deposits-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>User ID</th>
                    <th>Amount</th>
                    <th>Transaction Text</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deposits.filter(d => d.status === 'pending').map(deposit => (
                    <tr key={deposit.id}>
                      <td>{deposit.id}</td>
                      <td>{deposit.user_id}</td>
                      <td className="amount">{deposit.amount} Birr</td>
                      <td className="transaction-text">{deposit.transaction_text}</td>
                      <td>{new Date(deposit.created_at).toLocaleString()}</td>
                      <td>
                        <button 
                          className="btn-approve"
                          onClick={() => approveDeposit(deposit.id)}
                        >
                          Approve
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'bonus' && (
          <div className="bonus-management">
            <h2>Bonus Settings</h2>
            <div className="bonus-settings glass-card">
              <h3>Daily Play Bonus</h3>
              <div className="setting-group">
                <label>Required Games:</label>
                <input type="number" placeholder="200" />
              </div>
              <div className="setting-group">
                <label>Bonus Amount (Birr):</label>
                <input type="number" placeholder="50" />
              </div>
              <div className="setting-group">
                <label>Time Window:</label>
                <input type="time" /> to <input type="time" />
              </div>
              
              <h3>Fast Win Bonus</h3>
              <div className="setting-group">
                <label>Call Limit:</label>
                <input type="number" placeholder="5" />
              </div>
              <div className="setting-group">
                <label>Bonus Percentage (%):</label>
                <input type="number" placeholder="1000" />
              </div>
              <div className="setting-group">
                <label>
                  <input type="checkbox" /> Enable Night Bonus
                </label>
              </div>
              
              <button className="btn-primary">Save Settings</button>
            </div>
          </div>
        )}
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedUser(null)}>×</button>
            <h2>User Details: {selectedUser.username || selectedUser.telegram_id}</h2>
            <div className="user-details">
              <p><strong>ID:</strong> {selectedUser.id}</p>
              <p><strong>Telegram ID:</strong> {selectedUser.telegram_id}</p>
              <p><strong>Phone:</strong> {selectedUser.phone || 'N/A'}</p>
              <p><strong>Balance:</strong> {selectedUser.wallet_balance} Birr</p>
              <p><strong>Games Played:</strong> {selectedUser.total_games_played}</p>
              <p><strong>Games Won:</strong> {selectedUser.total_games_won}</p>
              <p><strong>Bonus Won:</strong> {selectedUser.total_bonus_won} Birr</p>
              <p><strong>Joined:</strong> {new Date(selectedUser.created_at).toLocaleDateString()}</p>
            </div>
            <div className="admin-actions">
              <h3>Admin Actions</h3>
              <div className="action-group">
                <input type="number" placeholder="Amount" id="walletAmount" />
                <select id="walletType">
                  <option value="deposit">Add Funds</option>
                  <option value="deduction">Deduct Funds</option>
                  <option value="bonus">Give Bonus</option>
                </select>
                <button 
                  className="btn-primary"
                  onClick={() => {
                    const amount = document.getElementById('walletAmount').value;
                    const type = document.getElementById('walletType').value;
                    if (amount) {
                      updateWallet(selectedUser.id, parseFloat(amount), type, 'Admin adjustment');
                      setSelectedUser(null);
                    }
                  }}
                >
                  Update Wallet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPanel;