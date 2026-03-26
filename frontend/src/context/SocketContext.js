import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const { token, user } = useAuth();
  const socketRef = useRef(null);

  useEffect(() => {
    if (!token || !user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // Use the current page's origin (Railway URL)
    const socketUrl = window.location.origin;
    console.log('🔌 Connecting to socket server:', socketUrl);
    
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 30000
    });
    
    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('✅ Socket connected successfully!', newSocket.id);
      setIsConnected(true);
      newSocket.emit('authenticate', token);
    });

    newSocket.on('authenticated', (data) => {
      console.log('✅ Socket authenticated successfully', data);
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error.message);
      setIsConnected(false);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
      setIsConnected(false);
    });

    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    return () => {
      console.log('Cleaning up socket connection');
      if (newSocket) {
        newSocket.disconnect();
      }
      setSocket(null);
      setIsConnected(false);
    };
  }, [token, user]);

  const value = {
    socket,
    isConnected,
    emit: (event, data) => {
      if (socket && isConnected) {
        socket.emit(event, data);
      } else {
        console.warn('Socket not connected, cannot emit:', event);
      }
    },
    on: (event, callback) => {
      if (socket) {
        socket.on(event, callback);
        return () => socket.off(event, callback);
      }
      return () => {};
    }
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};