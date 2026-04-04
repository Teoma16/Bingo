import React, { useState } from 'react';
import axios from 'axios';
import './DepositModal.css';

function DepositModal({ isOpen, onClose, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [smsText, setSmsText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const API_URL = '/api';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const depositAmount = parseFloat(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) {
      setError('Please enter a valid amount');
      setLoading(false);
      return;
    }

    if (!smsText.trim()) {
      setError('Please enter the SMS text from Telebirr');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/wallet/deposit/request`,
        {
          amount: depositAmount,
          transactionText: smsText
        },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        setSuccess(`✅ Deposit request submitted! Amount: ${depositAmount} Birr. Please wait for admin approval.`);
        setAmount('');
        setSmsText('');
        setTimeout(() => {
          onSuccess && onSuccess();
          onClose();
        }, 3000);
      }
    } catch (error) {
      console.error('Deposit error:', error);
      setError(error.response?.data?.error || 'Failed to submit deposit request');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="deposit-modal-overlay" onClick={onClose}>
      <div className="deposit-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>💰 Deposit Money</h2>
        
        <div className="telebirr-info">
          <p>Send money to Telebirr:</p>
          <div className="telebirr-number">09XX-XXXXXX</div>
          <p className="instruction">After sending, paste the SMS confirmation below:</p>
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
              step="10"
              required
            />
          </div>

          <div className="form-group">
            <label>Telebirr SMS Text</label>
            <textarea
              value={smsText}
              onChange={(e) => setSmsText(e.target.value)}
              placeholder="Paste the SMS confirmation from Telebirr here..."
              rows="4"
              required
            />
            <small>Copy the entire SMS message from Telebirr and paste it here</small>
          </div>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Submitting...' : 'Submit Deposit Request'}
          </button>
        </form>

        <div className="deposit-note">
          <p>⚠️ Note:</p>
          <ul>
            <li>Deposits are processed manually by admin</li>
            <li>Processing time: 5-30 minutes</li>
            <li>Minimum deposit: 10 Birr</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default DepositModal;