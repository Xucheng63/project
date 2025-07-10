// components/ChatInputBox.jsx
import React, { useRef, useEffect } from 'react';

const ChatInputBox = ({ message, setMessage, handleSubmit, isTyping }) => {
  const textareaRef = useRef(null);
  
  // Automatically adjust the height of the text box
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [message]);
  
  // Handle the Enter key to send a message
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };
  
  return (
    <div className="chat-input-area">
      <form onSubmit={handleSubmit} className="chat-form">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          disabled={isTyping}
          className="message-input"
          rows={1}
        />
        <button 
          type="submit" 
          className={`send-btn ${!message.trim() ? 'disabled' : ''}`}
          disabled={!message.trim() || isTyping}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="send-icon">
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </button>
      </form>
      
    </div>
  );
};

export default ChatInputBox;