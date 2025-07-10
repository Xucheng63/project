// components/ApiKeyInput.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from './Header';
import './ApiKeyInput.css';

const ApiKeyInput = ({ onSuccess }) => {
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const username = localStorage.getItem('username');

  // 验证 API Key 格式
  const validateApiKeyFormat = (key) => {
    const patterns = [
      /^sk-[A-Za-z0-9]{48,}$/,
      /^sk-proj-[A-Za-z0-9_-]{48,}$/
    ];
    
    return patterns.some(pattern => pattern.test(key));
  };

  // 验证 API Key 是否有效
  const validateApiKey = async () => {
    if (!apiKey.trim()) {
      setError('Please enter your API Key');
      return;
    }

    if (!validateApiKeyFormat(apiKey)) {
      setError('Invalid API Key format. It should start with "sk-" or "sk-proj-"');
      return;
    }

    setIsValidating(true);
    setError('');

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/validate-api-key`,
        { apiKey }
      );

      if (response.data.valid) {
        handleSubmit();
      } else {
        setError('Invalid API Key. Please check and try again.');
      }
    } catch (error) {
      console.error('API Key validation failed:', error);
      setError('Validation failed. Please check your connection.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async () => {
    if (!apiKey.trim()) {
      setError('Please enter your API Key');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/set-api-key`,
        { 
          apiKey,
          username: localStorage.getItem('username')
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      if (response.data.success) {
        localStorage.setItem('hasApiKey', 'true');
        
        // Show success message
        const successMessage = document.createElement('div');
        successMessage.className = 'success-toast';
        successMessage.textContent = 'API Key set successfully!';
        document.body.appendChild(successMessage);
        
        setTimeout(() => {
          document.body.removeChild(successMessage);
          if (onSuccess) {
            onSuccess();
          }
          navigate('/chat');
        }, 1500);
      } else {
        setError(response.data.error || 'Failed to set API Key');
      }
    } catch (error) {
      console.error('Failed to set API Key:', error);
      setError(error.response?.data?.error || 'Setup failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('hasApiKey');
    navigate('/login');
  };

  return (
    <div className="app-container">
      <Header 
        username={username} 
        toggleSidebar={() => {}} 
        isSidebarOpen={false}
      />
      
      <div className="app-content">
        <main className="main-content api-key-setup">
          <div className="setup-container">
            <div className="setup-card">
              <div className="setup-header">
                <div className="setup-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                    <path d="M21 2L14 9M14 9L9 14L4 21L3 20L10 15L14 9Z" 
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h1 className="setup-title">API Key Setup</h1>
                <p className="setup-subtitle">
                  Connect your OpenAI API key to start using AI features
                </p>
              </div>

              <div className="setup-content">
                <div className="api-key-form">
                  <div className="form-group">
                    <label htmlFor="apiKey" className="form-label">
                      <span>OpenAI API Key</span>
                      <span className="required-badge">Required</span>
                    </label>
                    
                    <div className="input-wrapper">
                      <input
                        type={showKey ? "text" : "password"}
                        id="apiKey"
                        value={apiKey}
                        onChange={(e) => {
                          setApiKey(e.target.value);
                          setError(''); // Clear error when typing
                        }}
                        className={`api-input ${error ? 'error' : ''}`}
                        placeholder="sk-..."
                        disabled={isLoading || isValidating}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            validateApiKey();
                          }
                        }}
                      />
                      
                      <button
                        type="button"
                        className="toggle-visibility-btn"
                        onClick={() => setShowKey(!showKey)}
                        tabIndex={-1}
                      >
                        {showKey ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8-11-8-11-8z" 
                                  stroke="currentColor" strokeWidth="2"/>
                            <circle cx="12" cy="12" r="3" 
                                    stroke="currentColor" strokeWidth="2"/>
                          </svg>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" 
                                  stroke="currentColor" strokeWidth="2"/>
                            <path d="M1 1L23 23" 
                                  stroke="currentColor" strokeWidth="2"/>
                          </svg>
                        )}
                      </button>
                    </div>
                    
                    {error && (
                      <div className="error-message">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                          <path d="M12 8V12M12 16H12.01" stroke="currentColor" strokeWidth="2"/>
                        </svg>
                        <span>{error}</span>
                      </div>
                    )}
                  </div>

                  <div className="info-cards">
                    <div className="info-card">
                      <div className="info-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <path d="M12 2L2 7V12C2 16.5 5 20.2 12 21C19 20.2 22 16.5 22 12V7L12 2Z" 
                                stroke="currentColor" strokeWidth="2"/>
                        </svg>
                      </div>
                      <div className="info-content">
                        <h3>Secure</h3>
                        <p>Your key is encrypted and stored safely</p>
                      </div>
                    </div>
                    
                    <div className="info-card">
                      <div className="info-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" 
                                stroke="currentColor" strokeWidth="2"/>
                          <path d="M7 11V7A5 5 0 0117 7V11" 
                                stroke="currentColor" strokeWidth="2"/>
                        </svg>
                      </div>
                      <div className="info-content">
                        <h3>Private</h3>
                        <p>Never shared with third parties</p>
                      </div>
                    </div>
                    
                    <div className="info-card">
                      <div className="info-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" 
                                stroke="currentColor" strokeWidth="2"/>
                        </svg>
                      </div>
                      <div className="info-content">
                        <h3>Instant</h3>
                        <p>Start using AI features immediately</p>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={validateApiKey}
                    disabled={isLoading || isValidating || !apiKey.trim()}
                    className={`setup-button ${(isLoading || isValidating) ? 'loading' : ''}`}
                  >
                    {isLoading ? (
                      <>
                        <span>Setting up</span>
                        <div className="btn-loader"></div>
                      </>
                    ) : isValidating ? (
                      <>
                        <span>Validating</span>
                        <div className="btn-loader"></div>
                      </>
                    ) : (
                      <>
                        <span>Continue to Chat</span>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path d="M5 12H19M19 12L12 5M19 12L12 19" 
                                stroke="currentColor" strokeWidth="2"/>
                        </svg>
                      </>
                    )}
                  </button>

                  <div className="help-section">
                    <p className="help-text">
                      Don't have an API key? 
                      <a href="https://platform.openai.com/api-keys" 
                         target="_blank" 
                         rel="noopener noreferrer"
                         className="help-link">
                        Get one from OpenAI
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M18 13V19C18 20.1 17.1 21 16 21H5C3.9 21 3 20.1 3 19V8C3 6.9 3.9 6 5 6H11" 
                                stroke="currentColor" strokeWidth="2"/>
                          <path d="M15 3H21V9" stroke="currentColor" strokeWidth="2"/>
                          <path d="M10 14L21 3" stroke="currentColor" strokeWidth="2"/>
                        </svg>
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ApiKeyInput;