// components/Sidebar.jsx
import React from 'react';

const Sidebar = ({ 
  isOpen,
  username, 
  userHasEmail,
  historySessions,
  isLoadingHistory, // Add loading state prop
  onNewChat,
  onSelectHistory,
  onDeleteHistory,
  onBindEmail,
  onUnbindEmail,
  onLogout,
  onFetchHistory,
  showBindEmailForm,
  email,
  setEmail,
  verificationCode,
  setVerificationCode,
  handleSendEmailVerificationCode,
  handleSubmitBindEmail
}) => {
  return (
    <aside className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
      <div className="sidebar-header">
        <button onClick={onNewChat} className="new-chat-btn">
          <span>New session</span>
          <span className="icon">+</span>
        </button>
      </div>
      
      <div className="history-container">
        <div className="history-header">
          <h3>Dialogue history</h3>
          <button 
            className="refresh-btn" 
            onClick={onFetchHistory}
            disabled={isLoadingHistory} // Disable button while loading
          >
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              className={isLoadingHistory ? 'spinning' : ''} // Add spinning animation
            >
              <path d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 12H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 8L16 12L12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        
        <div className="history-list">
          {isLoadingHistory ? (
            <div className="empty-history">
              <div className="loading-spinner">
                <span className="spinner-dot"></span>
                <span className="spinner-dot"></span>
                <span className="spinner-dot"></span>
              </div>
              <p>Loading history...</p>
            </div>
          ) : historySessions.length > 0 ? (
            historySessions.map((session, index) => (
              <div key={session._id || index} className="history-item-wrapper">
                <div 
                  className="history-item"
                  onClick={() => onSelectHistory(session)}
                >
                  <span className="history-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M8 10H8.01M12 10H12.01M16 10H16.01M9 16H5C3.89543 16 3 15.1046 3 14V6C3 4.89543 3.89543 4 5 4H19C20.1046 4 21 4.89543 21 6V14C21 15.1046 20.1046 16 19 16H15L12 19L9 16Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                  <div className="history-content">
                    <span className="history-title">
                      {session.title || 
                       (session.messages && session.messages[0] ? 
                        (typeof session.messages[0].content === 'string' 
                          ? session.messages[0].content.substring(0, 25) 
                          : 'New conversation') + 
                        (session.messages[0].content?.length > 25 ? '...' : '') : 
                        `Dialogue ${index + 1}`)}
                    </span>
                    <span className="history-date">
                      {new Date(session.lastActivity || session.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <button 
                  className="delete-history-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Are you sure you want to delete this conversation?')) {
                      onDeleteHistory(session._id);
                    }
                  }}
                  aria-label="Delete conversation"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" 
                          stroke="currentColor" 
                          strokeWidth="2" 
                          strokeLinecap="round" 
                          strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            ))
          ) : (
            <div className="empty-history">
              <p>There are no historical conversations</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Email Binding Form */}
      {showBindEmailForm && (
        <div className="email-form-container">
          <h3>Bind mailbox</h3>
          <form onSubmit={handleSubmitBindEmail} className="email-form">
            <div className="form-group">
              <label htmlFor="email">Email address</label>
              <input
                type="email"
                id="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            
            <div className="form-group verification-group">
              <label htmlFor="code">Verification code</label>
              <div className="verification-input">
                <input
                  type="text"
                  id="code"
                  placeholder="Verification code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={handleSendEmailVerificationCode}
                  className="send-code-btn"
                >
                  Send verification code
                </button>
              </div>
            </div>
            
            <div className="form-actions">
              <button type="submit" className="bind-submit-btn">Bind mailbox</button>
              <button type="button" onClick={() => onBindEmail()} className="bind-cancel-btn">Cancel</button>
            </div>
          </form>
        </div>
      )}
      
      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">{username ? username[0].toUpperCase() : '?'}</div>
          <div className="user-name">{username}</div>
        </div>
        
        <div className="sidebar-actions">
          {!userHasEmail ? (
            <button onClick={onBindEmail} className="action-btn bind-email-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 8L10.7574 13.7574C11.4372 14.2775 12.5628 14.2775 13.2426 13.7574L21 8M5 19H19C20.1046 19 21 18.1046 21 17V7C21 5.89543 20.1046 5 19 5H5C3.89543 5 3 5.89543 3 7V17C3 18.1046 3.89543 19 5 19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Bind mailbox
            </button>
          ) : (
            <button onClick={onUnbindEmail} className="action-btn unbind-email-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Unbind mailbox
            </button>
          )}
          
          <button onClick={onLogout} className="action-btn logout-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9M16 17L21 12M21 12L16 7M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Log out
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;