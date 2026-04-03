import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Login from './pages/Login';
import SelectionPage from './pages/SelectionPage';  // New - for selecting numbers
import GameplayPage from './pages/GameplayPage';    // New - for playing the game
import AdminPanel from './pages/AdminPanel';
import PrivateRoute from './components/PrivateRoute';
import './styles/casino-theme.css';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <Router>
          <div className="App">
            <Routes>
              <Route path="/login" element={<Login />} />
              {/* Home page now shows SelectionPage (lucky numbers) */}
              <Route path="/" element={<PrivateRoute><SelectionPage /></PrivateRoute>} />
              {/* Gameplay page shown when game starts */}
              <Route path="/gameplay" element={<PrivateRoute><GameplayPage /></PrivateRoute>} />
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