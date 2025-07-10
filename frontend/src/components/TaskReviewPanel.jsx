// components/TaskReviewPanel.jsx
import React from 'react';

const TaskReviewPanel = ({ 
  subtasks, 
  onConfirm, 
  onCancel, 
  onEdit,
  editingSubtaskIndex,
  editingSubtaskContent,
  setEditingSubtaskContent,
  handleSubmitSubtaskEdit,
  handleCancelSubtaskEdit,
  isConfirming
}) => {
  if (!subtasks || subtasks.length === 0) {
    return null;
  }
  
  return (
    <div className="task-review-panel">
      <div className="review-header">
        <h2>Task plan review</h2>
        <p className="review-description">
        The system has split your main task into {subtasks.length} subtasks. Please review the following task plan. You can edit the task details and then confirm the execution or cancellation of the task.
        </p>
      </div>
      
      {editingSubtaskIndex !== null ? (
        <div className="subtask-edit-container">
          <h3>Edit subtasks #{editingSubtaskIndex + 1}</h3>
          <textarea
            className="subtask-edit-textarea"
            value={editingSubtaskContent}
            onChange={(e) => setEditingSubtaskContent(e.target.value)}
            rows={15}
          />
          
          <div className="subtask-edit-actions">
            <button 
              className="submit-edit-btn"
              onClick={handleSubmitSubtaskEdit}
            >
              Save changes
            </button>
            <button 
              className="cancel-edit-btn"
              onClick={handleCancelSubtaskEdit}
            >
              Unedit
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="subtasks-list">
            {subtasks.map((task, index) => (
              <div key={index} className="review-subtask-item">
                <div className="subtask-header">
                  <div className="subtask-number">{index + 1}</div>
                  <div className="subtask-title">{task.task}</div>
                  <div className={`subtask-type type-${task.Type}`}>
                    {task.Type === 'Coding' ? 'Programming task' : 
                     task.Type === 'Non-Coding' ? 'Non-programming tasks' : 'Read-only task'}
                  </div>
                  <button 
                    className="edit-subtask-btn"
                    onClick={() => onEdit(index)}
                    disabled={isConfirming}
                  >
                    Edit
                  </button>
                </div>
                
                <div className="subtask-details">
                  <div className="detail-row">
                    <span className="detail-label">Description:</span>
                    <span className="detail-value">{task.description}</span>
                  </div>
                  
                  <div className="detail-row">
                    <span className="detail-label">Expected output:</span>
                    <span className="detail-value">{task["Expected Output"]}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="review-actions">
            <button 
              className={`confirm-btn ${isConfirming ? 'loading' : ''}`}
              onClick={onConfirm}
              disabled={isConfirming}
            >
              {isConfirming ? (
                <>
                  In execution
                  <span className="loading-spinner">
                    <span className="spinner-dot"></span>
                    <span className="spinner-dot"></span>
                    <span className="spinner-dot"></span>
                  </span>
                </>
              ) : 'Confirm and start'}
            </button>
            <button 
              className="cancel-btn"
              onClick={onCancel}
              disabled={isConfirming}
            >
              Cancel the task
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default TaskReviewPanel;