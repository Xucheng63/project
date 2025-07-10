// components/TaskPlanView.jsx
import React, { useState } from 'react';

const TaskPlanView = ({ subtasks, currentTaskIndex }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!subtasks || subtasks.length === 0) {
    return null;
  }
  
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };
  
  return (
    <div className="task-plan-container">
      <div 
        className="plan-header"
        onClick={toggleExpanded}
      >
        <h3>Task execution plan ({subtasks.length} subtasks)</h3>
        <span className="expand-icon">
          {isExpanded ? '▼' : '▶'}
        </span>
      </div>
      
      {isExpanded && (
        <div className="plan-tasks">
          {subtasks.map((task, index) => (
            <div 
              key={index} 
              className={`plan-task-item ${currentTaskIndex === index ? 'current-task' : ''}`}
            >
              <div className="task-number">{index + 1}</div>
              <div className="task-details">
                <div className="task-title">{task.task}</div>
                <div className="task-description">{task.description}</div>
                <div className="task-meta">
                  <span className={`subtask-type type-${task.Type}`}>
                    {task.Type === 'Coding' ? 'Programming task' : 
                     task.Type === 'Non-Coding' ? 'Non-programming tasks' : 'Read-only task'}
                  </span>
                  
                  {task.Status && task.Status !== "Not yet started..." && (
                    <span className="task-status">
                      {index < currentTaskIndex ? 'Completed' : 
                       index === currentTaskIndex ? 'Under way' : 'Waiting'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TaskPlanView;