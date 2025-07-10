// components/AIDialogueEditModal.jsx
import React, { useEffect } from 'react';

const AIDialogueEditModal = ({ 
  dialogue, 
  editedContent, 
  setEditedContent, 
  onSubmit, 
  onCancel,
  isProcessing 
}) => {
  // Add keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        onSubmit();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, onSubmit]);
  
  if (!dialogue) return null;
  
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="ai-dialogue-edit-modal" onClick={e => e.stopPropagation()}>
        <div className="dialogue-edit-info">
          <div className="dialogue-edit-meta">
            <span className="dialogue-role">
              {dialogue.role === 'system' ? 'S' : 
               dialogue.role === 'user' ? 'U' : 'AI'}
            </span>
            <span className="dialogue-step">{dialogue.step}</span>
          </div>
          
          <p className="dialogue-edit-hint">
          After editing the content of this message, it will affect the direction of subsequent AI conversations. Please ensure that your modifications contribute to achieving better results.
          </p>
        </div>
        
        <textarea
          className="dialogue-edit-textarea"
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          placeholder="Edit the content of the AI conversation..."
          rows={15}
          disabled={isProcessing}
        />
        
        <div className="dialogue-edit-actions">
          <button 
            className={`dialogue-edit-submit ${isProcessing ? 'loading' : ''}`}
            onClick={onSubmit}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                Being submitted
                <span className="loading-spinner">
                  <span className="spinner-dot"></span>
                  <span className="spinner-dot"></span>
                  <span className="spinner-dot"></span>
                </span>
              </>
            ) : 'Save changes'}
          </button>
          
          <button 
            className="dialogue-edit-cancel"
            onClick={onCancel}
            disabled={isProcessing}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIDialogueEditModal;