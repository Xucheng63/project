// frontend/src/components/Register.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Register.css';

const Register = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); // Add confirmation password status
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSendCode = async () => {
    if (!email) {
      setError('Email is required');
      return;
    }
    try {
      await axios.post('http://localhost:8000/api/auth/send-verification-code', { email });
      alert('Verification code has been sent to your email');
    } catch (error) {
      console.error('Error sending verification code:', error);
      if (error.response && error.response.data && error.response.data.errors) {
        setError(error.response.data.errors.map(err => err.msg).join('\n'));
      } else {
        setError('Failed to send verification code');
      }
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    // Verify whether the password and the confirmation password are the same
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!username) {
      setError('Username is required');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    if (!email) {
      setError('Email is required');
      return;
    }
    if (!verificationCode) {
      setError('Verification code is required');
      return;
    }

    try {
      await axios.post('http://localhost:8000/api/auth/register', { username, password, email, verificationCode });
      alert('Registration successful');
      navigate('/login');
    } catch (error) {
      console.error('Error registering:', error);
      if (error.response && error.response.data && error.response.data.errors) {
        setError(error.response.data.errors.map(err => err.msg).join('\n'));
      } else {
        setError('Registration failed');
      }
    }
  };

  return (
    <div className="register-container">
      <div className="register-card">
        <h2 className="register-title">Register</h2>
        {error && <p className="error-message">{error}</p>}
        <form onSubmit={handleRegister} className="register-form">
          <div className="form-group">
            <label htmlFor="username" className="form-label">Username:</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="form-input"
              placeholder="Enter your username"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password" className="form-label">Password:</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="Enter your password"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword" className="form-label">Confirm Password:</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="form-input"
              placeholder="Confirm your password"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="email" className="form-label">Email:</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              placeholder="Enter your email"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="verificationCode" className="form-label">Verification Code:</label>
            <input
              type="text"
              id="verificationCode"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              className="form-input"
              placeholder="Enter verification code"
              required
            />
          </div>
          <button type="button" onClick={handleSendCode} className="send-code-button">
            Send Verification Code
          </button>
          <button type="submit" className="register-button">
            Register
          </button>
        </form>
        <button onClick={() => navigate('/login')} className="back-to-login-button">
          Back to Login
        </button>
      </div>
    </div>
  );
};

export default Register;