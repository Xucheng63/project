// frontend/src/Welcome.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Welcome.css'
const Welcome = () => {
  const navigate = useNavigate();

  const handleStart = () => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      navigate('/chat');
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="welcome-container">
      <h1>Welcome to the AI Communication Platform</h1>
      <button onClick={handleStart}>Start</button>
    </div>
  );
};

export default Welcome;