import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Login from './pages/Login';
//import Dashboard from './pages/Dashboard';
//import GameRoom from './pages/GameRoom';
import GamePage from './pages/GamePage';
import AdminPanel from './pages/AdminPanel';
import PrivateRoute from './components/PrivateRoute';
import { useEffect } from 'react';
import './styles/casino-theme.css';  // Add this import
import './App.css';

function App() {
	 useEffect(() => {
    // Detect if running inside Telegram
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      
      // Expand to full screen
      tg.expand();
      
      // Set theme colors to match your casino theme
      tg.setHeaderColor('#1a1a2e');
      tg.setBackgroundColor('#0a0a0f');
      
      // Get user data if available
      const initData = tg.initDataUnsafe;
      if (initData && initData.user) {
        console.log('Telegram user:', initData.user);
        // You can auto-login using Telegram user ID
        // Send this to your backend for authentication
      }
      
      // Ready button
      tg.ready();
      
      // Handle closing
      tg.onEvent('viewportChanged', () => {
        console.log('Viewport changed');
      });
    }
  }, []);
  return (
    <AuthProvider>
      <SocketProvider>
        <Router>
          <div className="App">
            <Routes>
			<Route path="/" element={<PrivateRoute><GamePage /></PrivateRoute>} />
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
              <Route path="/game/:roomId" element={<PrivateRoute><GameRoom /></PrivateRoute>} />
              <Route path="/admin" element={<PrivateRoute adminOnly><AdminPanel /></PrivateRoute>} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </div>
        </Router>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;