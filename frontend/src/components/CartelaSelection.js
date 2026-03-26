import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import './CartelaSelection.css';

function CartelaSelection({ roomId, entryFee, onConfirm, onCancel, gameId }) {
  const [selectedNumbers, setSelectedNumbers] = useState([]);
  const [viewingCartela, setViewingCartela] = useState(null);
  const [generatedCartelas, setGeneratedCartelas] = useState({});
  const [showCartelaModal, setShowCartelaModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [takenNumbers, setTakenNumbers] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  
  const { socket, isConnected, on, emit } = useSocket();
  //const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const API_URL = '/api';
const SOCKET_URL = window.location.origin;

  // Fetch taken numbers for this game
  useEffect(() => {
    if (gameId) {
      fetchTakenNumbers();
      // Refresh taken numbers every 5 seconds as backup
      const interval = setInterval(fetchTakenNumbers, 5000);
      return () => clearInterval(interval);
    }
  }, [gameId]);

  // Listen for real-time taken numbers from other players
  useEffect(() => {
    if (!socket) return;
    
    const unsubscribe = on('numbers_taken', (data) => {
      console.log('Numbers taken event received:', data);
      // Update taken numbers in real-time
      setTakenNumbers(prev => {
        const newTaken = [...new Set([...prev, ...data.numbers])];
        return newTaken;
      });
      
      // Remove any selected numbers that were just taken
      setSelectedNumbers(prev => {
        const stillAvailable = prev.filter(num => !data.numbers.includes(num));
        if (stillAvailable.length !== prev.length) {
          alert(`⚠️ Numbers ${data.numbers.filter(n => prev.includes(n)).join(', ')} were just taken by another player!`);
        }
        return stillAvailable;
      });
    });
    
    return unsubscribe;
  }, [socket]);

  const fetchTakenNumbers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/game/games/${gameId}/taken-numbers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setTakenNumbers(data.takenNumbers || []);
    } catch (error) {
      console.error('Error fetching taken numbers:', error);
    }
  };

  const generateCartelaForNumber = async (luckyNumber) => {
    if (generatedCartelas[luckyNumber]) {
      return generatedCartelas[luckyNumber];
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/game/generate-cartela`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ luckyNumber })
      });
      
      const data = await response.json();
      const cartelaData = typeof data.cartela === 'string' ? JSON.parse(data.cartela) : data.cartela;
      
      setGeneratedCartelas(prev => ({
        ...prev,
        [luckyNumber]: cartelaData
      }));
      
      return cartelaData;
    } catch (error) {
      console.error('Error generating cartela:', error);
      return generateLocalCartela();
    }
  };

  const generateLocalCartela = () => {
    const cartela = [];
    const ranges = [
      { min: 1, max: 15 },
      { min: 16, max: 30 },
      { min: 31, max: 45 },
      { min: 46, max: 60 },
      { min: 61, max: 75 }
    ];
    
    for (let col = 0; col < 5; col++) {
      const column = [];
      const numbers = [];
      while (numbers.length < 5) {
        const num = Math.floor(Math.random() * (ranges[col].max - ranges[col].min + 1)) + ranges[col].min;
        if (!numbers.includes(num)) numbers.push(num);
      }
      numbers.sort((a, b) => a - b);
      for (let row = 0; row < 5; row++) {
        column.push(numbers[row]);
      }
      cartela.push(column);
    }
    cartela[2][2] = 'FREE';
    return cartela;
  };

  const handleNumberClick = async (number) => {
    // Check if number is already taken
    if (takenNumbers.includes(number)) {
      alert(`❌ Lucky number ${number} is already taken by another player!`);
      return;
    }
    
    setLoading(true);
    const cartela = await generateCartelaForNumber(number);
    setViewingCartela({ number, cartela });
    setShowCartelaModal(true);
    setLoading(false);
  };

  const handleSelectCartela = () => {
    if (!viewingCartela) return;
    
    // Double-check if number is still available before selecting
    if (takenNumbers.includes(viewingCartela.number)) {
      alert(`❌ Lucky number ${viewingCartela.number} was just taken by another player!`);
      setShowCartelaModal(false);
      setViewingCartela(null);
      fetchTakenNumbers();
      return;
    }
    
    if (selectedNumbers.includes(viewingCartela.number)) {
      setSelectedNumbers(prev => prev.filter(n => n !== viewingCartela.number));
    } else {
      if (selectedNumbers.length >= 2) {
        alert('You can only select up to 2 cartelas!');
        return;
      }
      setSelectedNumbers(prev => [...prev, viewingCartela.number]);
    }
    setShowCartelaModal(false);
    setViewingCartela(null);
  };

  const handleConfirm = async () => {
    if (selectedNumbers.length === 0) {
      alert('Please select at least one cartela!');
      return;
    }
    
    setRefreshing(true);
    
    // Double-check if all selected numbers are still available
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/game/games/${gameId}/taken-numbers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      const currentTakenNumbers = data.takenNumbers || [];
      
      const newlyTaken = selectedNumbers.filter(num => currentTakenNumbers.includes(num));
      
      if (newlyTaken.length > 0) {
        alert(`❌ Lucky numbers ${newlyTaken.join(', ')} were just taken by another player! Please select different numbers.`);
        setTakenNumbers(currentTakenNumbers);
        setSelectedNumbers(prev => prev.filter(num => !newlyTaken.includes(num)));
        setRefreshing(false);
        return;
      }
      
      // Broadcast to other players that these numbers are now taken
      if (socket && isConnected) {
        emit('numbers_confirmed', {
          gameId: gameId,
          luckyNumbers: selectedNumbers
        });
      }
      
      // All numbers are still available, proceed
      onConfirm(selectedNumbers);
    } catch (error) {
      console.error('Error checking taken numbers:', error);
      onConfirm(selectedNumbers);
    } finally {
      setRefreshing(false);
    }
  };

  const getLetter = (number) => {
    if (number <= 15) return 'B';
    if (number <= 30) return 'I';
    if (number <= 45) return 'N';
    if (number <= 60) return 'G';
    return 'O';
  };

  return (
    <div className="cartela-selection-modal">
      <div className="cartela-selection-content glass-card">
        <h2>🎲 Select Your Lucky Numbers</h2>
        <p className="room-info">Room: {roomId} | Entry Fee: {entryFee} Birr per cartela</p>
        <p className="selection-info">
          Selected: {selectedNumbers.length}/2 cartelas
          {selectedNumbers.length > 0 && (
            <span className="selected-numbers">
              (Numbers: {selectedNumbers.join(', ')})
            </span>
          )}
        </p>
        <p className="taken-info">
          🔴 Red numbers are already taken by other players
        </p>
        {isConnected && (
          <p className="live-status">🟢 Live updates enabled</p>
        )}

        <div className="lucky-numbers-grid">
          {Array.from({ length: 100 }, (_, i) => i + 1).map(number => (
            <button
              key={number}
              className={`lucky-number-btn 
                ${selectedNumbers.includes(number) ? 'selected' : ''} 
                ${takenNumbers.includes(number) ? 'taken' : ''}`}
              onClick={() => handleNumberClick(number)}
              disabled={takenNumbers.includes(number)}
            >
              {number}
            </button>
          ))}
        </div>

        <div className="selection-actions">
          <button 
            className="btn-primary" 
            onClick={handleConfirm}
            disabled={refreshing || selectedNumbers.length === 0}
          >
            {refreshing ? 'Checking...' : `Confirm ${selectedNumbers.length} Cartela(s)`}
          </button>
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>

      {showCartelaModal && viewingCartela && (
        <div className="cartela-preview-overlay" onClick={() => setShowCartelaModal(false)}>
          <div className="cartela-preview glass-card" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowCartelaModal(false)}>×</button>
            <h3>Lucky Number: {viewingCartela.number}</h3>
            <div className="bingo-card-preview">
              <div className="bingo-header">
                <div>B</div><div>I</div><div>N</div><div>G</div><div>O</div>
              </div>
              {[0, 1, 2, 3, 4].map(row => (
                <div key={row} className="bingo-row">
                  {[0, 1, 2, 3, 4].map(col => {
                    const number = viewingCartela.cartela[col]?.[row];
                    const isFree = number === 'FREE';
                    return (
                      <div
                        key={`${col}-${row}`}
                        className={`bingo-cell-preview ${isFree ? 'free' : ''}`}
                      >
                        {isFree ? '⭐' : number}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="preview-actions">
              <button 
                className={`btn-select ${selectedNumbers.includes(viewingCartela.number) ? 'selected' : ''}`}
                onClick={handleSelectCartela}
                disabled={takenNumbers.includes(viewingCartela.number)}
              >
                {takenNumbers.includes(viewingCartela.number) 
                  ? '❌ Already Taken' 
                  : selectedNumbers.includes(viewingCartela.number) 
                    ? '✓ Remove from Selection' 
                    : '➕ Select This Cartela'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CartelaSelection;