// frontend/src/App.jsx
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Welcome from './Welcome';
import Login from './Login';
import Register from './Register'; 
import Chat from './Chat';
import ApiKeyInput from './components/ApiKeyInput';

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    // 检查用户是否已登录
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    const apiKeyStatus = localStorage.getItem('hasApiKey');
    
    if (token && username) {
      setIsAuthenticated(true);
      setHasApiKey(apiKeyStatus === 'true');
    }
  }, []);

  // 私有路由组件
  const PrivateRoute = ({ children }) => {
    const token = localStorage.getItem('token');
    if (!token) {
      return <Navigate to="/login" replace />;
    }
    return children;
  };

  // API Key 保护路由
  const ApiKeyProtectedRoute = ({ children }) => {
    const token = localStorage.getItem('token');
    const apiKeyStatus = localStorage.getItem('hasApiKey');
    
    if (!token) {
      return <Navigate to="/login" replace />;
    }
    
    if (apiKeyStatus !== 'true') {
      return <Navigate to="/api-key" replace />;
    }
    
    return children;
  };

  const handleApiKeySuccess = () => {
    setHasApiKey(true);
    // 导航到聊天页面在组件内部处理
  };

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        {/* API Key 输入页面 - 需要登录但不需要 API Key */}
        <Route 
          path="/api-key" 
          element={
            <PrivateRoute>
              <ApiKeyInput onSuccess={handleApiKeySuccess} />
            </PrivateRoute>
          } 
        />
        
        {/* 聊天页面 - 需要登录和 API Key */}
        <Route 
          path="/chat" 
          element={
            <ApiKeyProtectedRoute>
              <Chat />
            </ApiKeyProtectedRoute>
          } 
        />
      </Routes>
    </Router>
  );
};

export default App;