import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';

function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Format phone number if needed
    let formattedPhone = phone.trim();
    // Remove any spaces or special characters
    formattedPhone = formattedPhone.replace(/\D/g, '');
    
    // Ensure it starts with 0
    if (formattedPhone.startsWith('251')) {
      formattedPhone = '0' + formattedPhone.substring(3);
    } else if (formattedPhone.startsWith('+251')) {
      formattedPhone = '0' + formattedPhone.substring(4);
    }
    
    // Validate phone format
    const phoneRegex = /^09[0-9]{8}$/;
    if (!phoneRegex.test(formattedPhone)) {
      setError('Invalid phone number. Please use format: 0912345678');
      setLoading(false);
      return;
    }

    const result = await login(formattedPhone, password);
    
    if (result.success) {
      navigate('/');
    } else {
      setError(result.error);
    }
    
    setLoading(false);
  };
// In your login page or main component
useEffect(() => {
  const autoLoginFromTelegram = async () => {
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      const user = tg.initDataUnsafe?.user;
      
      if (user) {
        try {
          const response = await axios.post(`${API_URL}/auth/telegram-auth`, {
            userId: user.id,
            username: user.username
          });
          
          if (response.data.success) {
            localStorage.setItem('token', response.data.token);
            // Navigate to dashboard
            navigate('/');
          }
        } catch (error) {
          console.error('Auto-login failed:', error);
        }
      }
    }
  };
  
  autoLoginFromTelegram();
}, []);
  return (
    <div className="login-container">
      <div className="login-card glass-card">
        <div className="casino-gold logo">
          🎰 BINGO GAME
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="0912345678"
              pattern="[0-9]{10}"
              title="Please enter 10-digit phone number starting with 09"
            />
            <small className="input-hint">Enter your phone number (e.g., 0912345678)</small>
          </div>
          
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
            />
          </div>
          
          {error && <div className="error-message">{error}</div>}
          
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        
        <div className="telegram-info">
          <p>Don't have an account?</p>
          
          <button 
            className="btn-telegram"
            onClick={() => window.open('https://t.me/LuckyBingoWinnerbot', '_blank')}
          >
            📱 Register on Telegram
          </button>
        </div>
      </div>
    </div>
  );
}

export default Login;