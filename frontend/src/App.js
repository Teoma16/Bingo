import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Login from './pages/Login';
import GamePage from './pages/GamePage';  // Change this - import GamePage instead of Dashboard
import AdminPanel from './pages/AdminPanel';
import PrivateRoute from './components/PrivateRoute';
import './styles/casino-theme.css';
import './App.css';
import SelectionPage from './pages/SelectionPage';
import GameplayPage from './pages/GameplayPage';

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <Router>
          <div className="App">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<PrivateRoute><GamePage /></PrivateRoute>} />  {/* Changed from Dashboard to GamePage */}
              <Route path="/admin" element={<PrivateRoute adminOnly><AdminPanel /></PrivateRoute>} />
              <Route path="*" element={<Navigate to="/" />} />
			  <Route path="/" element={<PrivateRoute><SelectionPage /></PrivateRoute>} />
<Route path="/gameplay" element={<PrivateRoute><GameplayPage /></PrivateRoute>} />
            </Routes>
          </div>
        </Router>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;