// components/SuccessModal.jsx
import React, { useEffect } from 'react';

const SuccessModal = ({ message, isOpen, onClose }) => {
  // Add keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  
  if (!isOpen) return null;
  
  return (
    <div className="success-modal-overlay" onClick={onClose}>
      <div className="success-modal-content" onClick={e => e.stopPropagation()}>
        <div className="success-header">
          <h3>Successful operation</h3>
          <button className="close-btn" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="success-body">
          <div className="success-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 12L11 15L16 10" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="success-message">{message}</p>
        </div>
        <div className="success-footer">
          <button className="success-close-btn" onClick={onClose}>
          OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuccessModal;