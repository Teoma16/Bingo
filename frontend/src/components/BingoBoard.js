import React from 'react';
import './BingoBoard.css';

function BingoBoard({ calledNumbers }) {
  const bingoNumbers = {
    B: Array.from({ length: 15 }, (_, i) => i + 1),
    I: Array.from({ length: 15 }, (_, i) => i + 16),
    N: Array.from({ length: 15 }, (_, i) => i + 31),
    G: Array.from({ length: 15 }, (_, i) => i + 46),
    O: Array.from({ length: 15 }, (_, i) => i + 61)
  };

  const isNumberCalled = (number) => {
    return calledNumbers.includes(number);
  };

  return (
    <div className="bingo-board-wrapper">
      <h3>🎯 BINGO Number Board</h3>
      <table className="bingo-table">
        <thead>
          <tr>
            <th>B</th>
            <th>I</th>
            <th>N</th>
            <th>G</th>
            <th>O</th>
          </tr>
        </thead>
        <tbody>
          {[...Array(15)].map((_, rowIndex) => (
            <tr key={rowIndex}>
              <td className={isNumberCalled(bingoNumbers.B[rowIndex]) ? 'called' : ''}>
                {bingoNumbers.B[rowIndex]}
              </td>
              <td className={isNumberCalled(bingoNumbers.I[rowIndex]) ? 'called' : ''}>
                {bingoNumbers.I[rowIndex]}
              </td>
              <td className={isNumberCalled(bingoNumbers.N[rowIndex]) ? 'called' : ''}>
                {bingoNumbers.N[rowIndex]}
              </td>
              <td className={isNumberCalled(bingoNumbers.G[rowIndex]) ? 'called' : ''}>
                {bingoNumbers.G[rowIndex]}
              </td>
              <td className={isNumberCalled(bingoNumbers.O[rowIndex]) ? 'called' : ''}>
                {bingoNumbers.O[rowIndex]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="bingo-stats">
        <span>📊 Called: {calledNumbers.length}/75</span>
        <span>
          {calledNumbers.length === 0 && 'Waiting for numbers...'}
          {calledNumbers.length > 0 && calledNumbers.length < 75 && 
            `${Math.round((calledNumbers.length / 75) * 100)}% Complete`}
          {calledNumbers.length === 75 && '🎉 COMPLETE!'}
        </span>
      </div>
    </div>
  );
}

export default BingoBoard;