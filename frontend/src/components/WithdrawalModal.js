import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext'; // Add this import
import './WithdrawalModal.css';

function WithdrawalModal({ isOpen, onClose, balance, onSuccess }) {
  const { user } = useAuth(); // Get user from context
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const withdrawAmount = parseFloat(amount);
    
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      setError('Please enter a valid amount');
      setLoading(false);
      return;
    }
    
    if (withdrawAmount < 10) {
      setError('Minimum withdrawal amount is 10 Birr');
      setLoading(false);
      return;
    }
    
    if (withdrawAmount > balance) {
      setError(`Insufficient balance. Your balance is ${balance} Birr`);
      setLoading(false);
      return;
    }
    
    if (balance - withdrawAmount < 10) {
      setError(`You must leave at least 10 Birr in your wallet. Maximum withdrawal: ${balance - 10} Birr`);
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/wallet/withdraw/request`,
        { amount: withdrawAmount },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        setSuccess(`✅ Withdrawal request for ${withdrawAmount} Birr submitted! Admin will process within 24 hours.`);
        setAmount('');
        setTimeout(() => {
          onSuccess && onSuccess();
          onClose();
        }, 3000);
      }
    } catch (error) {
      console.error('Withdrawal error:', error);
      setError(error.response?.data?.error || 'Failed to submit withdrawal request');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="withdrawal-modal-overlay" onClick={onClose}>
      <div className="withdrawal-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="modal-icon">💸</div>
        <h2>Withdraw Money</h2>
        
        <div className="balance-info">
          <span>Available Balance:</span>
          <strong>{balance} Birr</strong>
        </div>
        
        <div className="withdrawal-rules">
          <p>📋 Rules:</p>
          <ul>
            <li>Minimum withdrawal: <strong>10 Birr</strong></li>
            <li>Minimum remaining balance: <strong>10 Birr</strong></li>
            <li>Maximum withdrawal: <strong>{balance - 10} Birr</strong></li>
            <li>Processing time: 24-48 hours</li>
            <li>Money sent to your registered phone: <strong>{user?.phone || 'Not registered'}</strong></li>
          </ul>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Amount (Birr)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              min="10"
              max={balance - 10}
              step="10"
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <button type="submit" className="btn-withdraw" disabled={loading}>
            {loading ? 'Processing...' : 'Request Withdrawal'}
          </button>
        </form>

        {/*<div className="withdrawal-note">
          <p>⚠️ Withdrawal requests are processed by admin. You'll receive the money via Telebirr to your registered phone number.</p>
        </div>*/}
      </div>
    </div>
  );
}

export default WithdrawalModal;