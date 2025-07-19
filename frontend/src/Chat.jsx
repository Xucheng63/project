// Chat.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

// Import components
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ChatInputBox from './components/ChatInputBox';
import TaskReviewPanel from './components/TaskReviewPanel';
import TaskPlanView from './components/TaskPlanView';
import AIDialogueSequence from './components/AIDialogueSequence';
import AIDialogueEditModal from './components/AIDialogueEditModal';
import ErrorModal from './components/ErrorModal';
import SuccessModal from './components/SuccessModal';
// Import utility functions
import { 
  tryParseJSON, 
  translateTaskType, 
  translateDialogueStep,
  cleanDialogueContent,
  formatJSONDisplay,
  simplifyStatusText,
  extractCodeBlocks
} from './utils/helpers';

// Import styles
import './Chat.css';


const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Content-Type': 'application/json',
  }
});


apiClient.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

const Chat = () => {
  // User-related state
  const [username, setUsername] = useState('');
  const [userHasEmail, setUserHasEmail] = useState(false);
  const [showBindEmailForm, setShowBindEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  
  // Session-related state
  const [sessionId, setSessionId] = useState(null);
  const [historySessions, setHistorySessions] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  // Chat-related state
  const [message, setMessage] = useState('');
  const [chats, setChats] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [image, setImage] = useState(null);
  const [imageUrl, setImageUrl] = useState(''); 

  // Task processing state
  const [allSubtasks, setAllSubtasks] = useState([]);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [pendingSubtasks, setPendingSubtasks] = useState([]);
  const [editingSubtaskIndex, setEditingSubtaskIndex] = useState(null);
  const [editingSubtaskContent, setEditingSubtaskContent] = useState('');
  const [editingTaskIndex, setEditingTaskIndex] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [processingTaskIndex, setProcessingTaskIndex] = useState(null);
  // AI dialogue-related state
  const [currentAiDialogues, setCurrentAiDialogues] = useState([]);
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [editingDialogue, setEditingDialogue] = useState(null);
  const [editedDialogueContent, setEditedDialogueContent] = useState('');
  const [isDialogueProcessing, setIsDialogueProcessing] = useState(false);
  const [isDialogueMode, setIsDialogueMode] = useState(false);
  const [pendingTaskResult, setPendingTaskResult] = useState(null);

  // Error handling state
  const [error, setError] = useState('');
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  // Current task state
  const [currentTask, setCurrentTask] = useState({
    main_task: '',
    task_index: -1,
    waiting_user_action: false,
    session_id: null
  });
  const [pendingReplacementIndex, setPendingReplacementIndex] = useState(null);
  // UI state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const navigate = useNavigate();
  const chatHistoryRef = useRef(null);
  const imageInputRef = useRef(null);

  // Initialize login status check
  useEffect(() => {
    const storedUsername = localStorage.getItem('username');
    const storedToken = localStorage.getItem('token');
    const hasApiKey = localStorage.getItem('hasApiKey');

    if (!storedUsername || !storedToken) {
      navigate('/login');
    } else if (hasApiKey !== 'true') {
      navigate('/api-key');
    } else {
      setUsername(storedUsername);
      fetchUserInfo();
      // Load history sessions on component mount
      fetchHistorySessions(false);
    }
  }, [navigate]);

  // Add periodic refresh of history
  useEffect(() => {
    if (!username || !localStorage.getItem('token')) return;
    
    // Refresh history every 30 seconds
    const interval = setInterval(() => {
      fetchHistorySessions(false);
    }, 30000);
    
    return () => clearInterval(interval);
  }, [username]);

  // Scroll to latest message
  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [chats]);

  // Get user information
  const fetchUserInfo = async () => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      setError('You are not logged in');
      setIsErrorModalOpen(true);
      return;
    }

    try {
      const response = await apiClient.get('/api/auth/me');

      const user = response.data;
      setUserHasEmail(!!user.email);
    } catch (error) {
      console.error('Failed to get user information:', error);
      let errorMessage = 'Failed to get user information, please try again later';
      
      if (error.response && error.response.data && error.response.data.errors) {
        errorMessage = error.response.data.errors.map(err => err.msg).join('\n');
      }
      
      setError(errorMessage);
      setIsErrorModalOpen(true);
    }
  };


const ensureSession = async (firstMessage = null) => {
  // Always check current sessionId first
  if (sessionId) {
    console.log("Using existing session:", sessionId);
    return sessionId;
  }
  
  // Only create new session if we really don't have one
  try {
    const newSessionId = crypto.randomUUID ? crypto.randomUUID() : 
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    
    const response = await apiClient.post('/api/sessions', {
      title: firstMessage ? firstMessage.substring(0, 50) : 'New Chat',
      firstMessage: firstMessage,
      sessionId: newSessionId
    });
    
    const returnedSessionId = response.data.sessionId || response.data.session._id;
    setSessionId(returnedSessionId);
    
    // Refresh history list after creating new session
    fetchHistorySessions(false);
    
    return returnedSessionId;
  } catch (error) {
    console.error('Failed to create session:', error);
    return null;
  }
};


  const saveMessageToSession = async (newMessage, currentSessionId) => {
    if (!currentSessionId) return;
    
    try {
      await apiClient.post(`/api/sessions/${currentSessionId}/messages`, {
        message: newMessage
      });
      
      // Refresh history list without opening sidebar
      fetchHistorySessions(false);
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  };
useEffect(() => {
  console.log("Current sessionId:", sessionId);
}, [sessionId]);

const saveSessionState = async () => {
  if (!sessionId) {
    console.warn("No sessionId available for saving");
    return;
  }
  
  console.log("Saving to session:", sessionId);
  
  try {
    // First try to update
    await apiClient.put(`/api/sessions/${sessionId}`, {
      messages: chats,
      taskInfo: {
        main_task: currentTask.main_task,
        session_id: sessionId,  // Use the component's sessionId, not currentTask.session_id
        subtasks: allSubtasks,
        currentTaskIndex: currentTask.task_index
      },
      title: chats.length > 0 && chats[0].role === 'user' 
        ? chats[0].content.substring(0, 50) + (chats[0].content.length > 50 ? '...' : '')
        : 'New Chat'
    });
    
    console.log("Session saved successfully:", sessionId);
    
    // Refresh history list after successful save (without opening sidebar)
    fetchHistorySessions(false);
    
  } catch (error) {
    // If 404, the session doesn't exist in database (shouldn't happen with proper flow)
    if (error.response && error.response.status === 404) {
      console.log('Session not found, creating new session...');
      try {
        // Create the session with the existing sessionId
        await apiClient.post('/api/sessions', {
          sessionId: sessionId,  // Use the existing sessionId
          title: chats.length > 0 && chats[0].role === 'user' 
            ? chats[0].content.substring(0, 50) + (chats[0].content.length > 50 ? '...' : '')
            : 'New Chat',
          firstMessage: chats.length > 0 && chats[0].role === 'user' 
            ? chats[0].content 
            : null
        });
        
        console.log("Created session with ID:", sessionId);
        
        // Then update it with full data
        await apiClient.put(`/api/sessions/${sessionId}`, {
          messages: chats,
          taskInfo: {
            main_task: currentTask.main_task,
            session_id: sessionId,
            subtasks: allSubtasks,
            currentTaskIndex: currentTask.task_index
          }
        });
        
        console.log("Session updated after creation:", sessionId);
        
        // Refresh history list
        fetchHistorySessions(false);
        
      } catch (createError) {
        console.error('Failed to create and update session:', createError);
        
        // If it's another 404 or conflict error, there might be a race condition
        if (createError.response && createError.response.status === 409) {
          console.log("Session already exists, retrying update...");
          // Retry the update one more time
          try {
            await apiClient.put(`/api/sessions/${sessionId}`, {
              messages: chats,
              taskInfo: {
                main_task: currentTask.main_task,
                session_id: sessionId,
                subtasks: allSubtasks,
                currentTaskIndex: currentTask.task_index
              }
            });
            
            // Refresh history list
            fetchHistorySessions(false);
          } catch (retryError) {
            console.error('Failed to update session on retry:', retryError);
          }
        }
      }
    } else {
      console.error('Failed to save session state:', error);
      // Don't show error modal for auto-save failures to avoid interrupting user
      // Only log the error
    }
  }
};


  useEffect(() => {
    if (!sessionId || chats.length === 0) return;
    
    const saveTimer = setTimeout(() => {
      saveSessionState();
    }, 5000); 
    
    return () => clearTimeout(saveTimer);
  }, [chats, allSubtasks, currentTask]);

  // Get history sessions 
  const fetchHistorySessions = async (autoOpen = true) => {
    setIsLoadingHistory(true);
    try {
      const response = await apiClient.get('/api/sessions', {
        params: { limit: 50 }
      });
      setHistorySessions(response.data);
      if (autoOpen) {
        setShowHistory(true);
      }
      return response.data;
    } catch (error) {
      console.error('Failed to get history sessions:', error);
      setError('Failed to get history sessions, please try again later');
      setIsErrorModalOpen(true);
      return [];
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Delete history records
  const handleDeleteHistory = async (sessionIdToDelete) => {
    try {
      await apiClient.delete(`/api/sessions/${sessionIdToDelete}`);
      

      setHistorySessions(prev => 
        prev.filter(session => session._id !== sessionIdToDelete)
      );
      
      // If the current session is deleted, the interface will be cleared.
      if (sessionIdToDelete === sessionId) {
        handleNewChat();
      }
      
      setSuccessMessage('Conversation deleted successfully');
      setIsSuccessModalOpen(true);
    } catch (error) {
      console.error('Failed to delete session:', error);
      setError('Failed to delete, please try again');
      setIsErrorModalOpen(true);
    }
  };

  // Send email verification code
  const handleSendEmailVerificationCode = async () => {
    if (!email) {
      setError('Please enter an email address');
      setIsErrorModalOpen(true);
      return;
    }

    try {
      const response = await apiClient.post('/api/auth/send-email-verification-code', {
        email,
      });

      if (response.status === 200) {
        // Fix: Use success message instead of error message
        setSuccessMessage('Verification code sent successfully, please check your email');
        setIsSuccessModalOpen(true);
      }
    } catch (error) {
      console.error('Failed to send verification code:', error);
      let errorMessage = 'Failed to send verification code, please try again later';
      
      if (error.response && error.response.data) {
        if (error.response.data.errors && error.response.data.errors.length > 0) {
          errorMessage = error.response.data.errors.map(err => err.msg).join('\n');
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error;
        }
      }
      
      setError(errorMessage);
      setIsErrorModalOpen(true);
    }
  };

  // Submit bind email
  const handleSubmitBindEmail = async (e) => {
    e.preventDefault();
    const storedToken = localStorage.getItem('token');
    
    if (!storedToken) {
      setError('You are not logged in');
      setIsErrorModalOpen(true);
      return;
    }

    if (!verificationCode) {
      setError('Please enter the verification code');
      setIsErrorModalOpen(true);
      return;
    }

    try {
      const response = await apiClient.post('/api/auth/verify-email', {
        email,
        verificationCode,
        token: storedToken,
      });

      if (response.status === 200) {
        // Fix: Use success message instead of error message
        setSuccessMessage('Email bound successfully');
        setIsSuccessModalOpen(true);
        setShowBindEmailForm(false);
        setUserHasEmail(true);
        // Clear form fields
        setEmail('');
        setVerificationCode('');
      }
    } catch (error) {
      console.error('Failed to bind email:', error);
      let errorMessage = 'Failed to bind email, please try again later';
      
      if (error.response && error.response.data) {
        if (error.response.data.errors && error.response.data.errors.length > 0) {
          errorMessage = error.response.data.errors.map(err => err.msg).join('\n');
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error;
        }
      }
      
      setError(errorMessage);
      setIsErrorModalOpen(true);
    }
  };

  // Handle bind email button
  const handleBindEmail = async () => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      setError('You are not logged in');
      setIsErrorModalOpen(true);
      return;
    }

    if (showBindEmailForm) {
      setShowBindEmailForm(false);
      return;
    }

    try {
      // Query current user info
      const userInfoResponse = await apiClient.get('/api/auth/me');

      const user = userInfoResponse.data;
      if (user.email) {
        // Fix: Use success message to display info
        setSuccessMessage('Email is already bound to your account');
        setIsSuccessModalOpen(true);
        return;
      }

      // User has no email, show bind email form
      setShowBindEmailForm(true);
    } catch (error) {
      console.error('Failed to check email status:', error);
      let errorMessage = 'Failed to check email status, please try again later';
      
      if (error.response && error.response.data) {
        if (error.response.data.errors && error.response.data.errors.length > 0) {
          errorMessage = error.response.data.errors.map(err => err.msg).join('\n');
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error;
        }
      }
      
      setError(errorMessage);
      setIsErrorModalOpen(true);
    }
  };

  // Handle unbind email
  const handleUnbindEmail = async () => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      setError('You are not logged in');
      setIsErrorModalOpen(true);
      return;
    }

    try {
      // Query current user info
      const userInfoResponse = await apiClient.get('/api/auth/me');

      const user = userInfoResponse.data;
      if (!user.email) {
        setError('No email is bound to your account');
        setIsErrorModalOpen(true);
        return;
      }

      // User has email, execute unbind operation
      const unbindResponse = await apiClient.post('/api/auth/unbind-email', {
        token: storedToken,
      });

      if (unbindResponse.status === 200) {
        // Fix: Use success message instead of error message
        setSuccessMessage('Email unbound successfully');
        setIsSuccessModalOpen(true);
        setUserHasEmail(false);
      }
    } catch (error) {
      console.error('Failed to unbind email:', error);
      let errorMessage = 'Failed to unbind email, please try again later';
      
      if (error.response && error.response.data) {
        if (error.response.data.errors && error.response.data.errors.length > 0) {
          errorMessage = error.response.data.errors.map(err => err.msg).join('\n');
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error;
        }
      }
      
      setError(errorMessage);
      setIsErrorModalOpen(true);
    }
  };

  // Close error prompt
  const handleErrorModalClose = () => {
    setIsErrorModalOpen(false);
  };

  // Handle send message
  const chat = async (e) => {
    e.preventDefault();
  
    if (!message && !image) return;
    setIsTyping(true);
  
    let newChat;
    if (image) {
      newChat = {
        role: 'user',
        content: [
          { type: "text", text: message || "Image uploaded" },
          {
            type: "image_url",
            image_url: {
              url: imageUrl
            }
          }
        ],
        isHistorical: false  
      };
    } else {
      newChat = {
        role: 'user',
        content: message,
        isHistorical: false  
      };
    }
  
    setChats((prevChats) => [...prevChats, newChat]);
    setMessage('');
  
    try {
      let imageUrl = null;
      if (image) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          imageUrl = e.target.result; // Base64
          newChat.content[1].image_url.url = imageUrl;
  
          const userId = localStorage.getItem('username');
          if (!userId) {
            throw new Error('User ID not available');
          }
  
          const response = await apiClient.post('/', {
            chats: [newChat],
            imageUrl: imageUrl,
            userId: userId,
            sessionId: sessionId,
          });
  
          if (response.status === 200) {
            const assistantResponse = { 
              role: 'assistant', 
              content: response.data.output.content,
              isHistorical: false  
            };
            setChats((prevChats) => [...prevChats, assistantResponse]);
            setSessionId(response.data.sessionId);
          } else {
            setError('Unable to send message, please try again later');
            setIsErrorModalOpen(true);
          }
        };
        reader.readAsDataURL(image);
      } else {
        const userId = localStorage.getItem('username');
        if (!userId) {
          throw new Error('User ID not available');
        }
  
        const response = await apiClient.post('/', {
          chats: [newChat],
          userId: userId,
          sessionId: sessionId,
        });
  
        if (response.status === 200) {
          const assistantResponse = { 
            role: 'assistant', 
            content: response.data.output.content,
            isHistorical: false  
          };
          setChats((prevChats) => [...prevChats, assistantResponse]);
          setSessionId(response.data.sessionId);
        } else {
          setError('Unable to send message, please try again later');
          setIsErrorModalOpen(true);
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setError('Unable to send message, please try again later');
      setIsErrorModalOpen(true);
    } finally {
      setIsTyping(false);
      setImage(null);
      if (imageInputRef.current) {
        imageInputRef.current.value = null;
      }
    }
  };

  // Handle image upload
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageUrl(e.target.result); // Base64 
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('hasApiKey'); 
    navigate('/login');
  };

  // Handle new chat
  const handleNewChat = () => {
    setChats([]);
    setMessage('');
    setIsTyping(false);
    setImage(null);
    setImageUrl(''); 
    setSessionId(null);
    setShowHistory(false);
    setAllSubtasks([]);
    setIsReviewMode(false);
    setPendingSubtasks([]);
    setCurrentAiDialogues([]);
    setDialogueIndex(0);
    setIsDialogueMode(false);
    setPendingTaskResult(null);
    setCurrentTask({
      main_task: '',
      task_index: -1,
      waiting_user_action: false,
      session_id: null
    });
    setIsSidebarOpen(false); // Automatically close sidebar on mobile devices
  };

  // Handle toggle sidebar
  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  // Switch to history chat 
  const handleHistoryChat = async (session) => {
    try {

      const response = await apiClient.get(`/api/sessions/${session._id}`);
      const fullSession = response.data;
      

      const historicalChats = (fullSession.messages || []).map(msg => ({
        ...msg,
        isHistorical: true  
      }));
      
      setChats(historicalChats);
      setSessionId(fullSession._id);
      

      if (fullSession.taskInfo) {
        setCurrentTask({
          main_task: fullSession.taskInfo.main_task || '',
          task_index: fullSession.taskInfo.currentTaskIndex || -1,
          session_id: fullSession._id,
          waiting_user_action: false
        });
        setAllSubtasks(fullSession.taskInfo.subtasks || []);
      } else {
        setCurrentTask({
          main_task: '',
          task_index: -1,
          session_id: fullSession._id,
          waiting_user_action: false
        });
      }
      
      setShowHistory(false);
      setIsSidebarOpen(false);
      setIsReviewMode(false);
      setPendingSubtasks([]);
      setCurrentAiDialogues([]);
      setDialogueIndex(0);
      setIsDialogueMode(false);
      setPendingTaskResult(null);
    } catch (error) {
      console.error('Failed to load session:', error);
      setError('Failed to load session');
      setIsErrorModalOpen(true);
    }
  };

  // Handle share chat
  const handleShare = () => {
    if (chats.length === 0) {
      setError('No messages to share');
      setIsErrorModalOpen(true);
      return;
    }

    let chatText = '';
    chats.forEach((chat, index) => {
      chatText += `${chat.role.toUpperCase()}: `;
      if (Array.isArray(chat.content)) {
        chat.content.forEach((item, idx) => {
          if (item.type === 'text') {
            chatText += `${item.text}`;
          } else if (item.type === 'image_url') {
            chatText += `[Image]`;
          }
          if (idx < chat.content.length - 1) {
            chatText += ' ';
          }
        });
      } else {
        chatText += chat.content;
      }
      chatText += '\n';
    });

    const blob = new Blob([chatText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chat-history-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Show/hide edit box
  const toggleEditTask = (taskIndex, initialContent = '', session_id, conversation_id) => {
    if (editingTaskIndex === taskIndex) {
      setEditingTaskIndex(null);
      setEditContent('');
      setIsEditing(false);
    } else {
      setEditingTaskIndex(taskIndex);
      setEditContent(initialContent);
      setIsEditing(true);
      setProcessingTaskIndex(taskIndex);
      
      // Simulate brief loading (optional)
      setTimeout(() => {
        setIsEditing(false);
      }, 500);
    }
  };

  // Display task result 
  const displayTaskResult = async (parsedData) => {
    // Format content
    let formattedContent = '';
    
    if (parsedData.subtask) {
      // Use subtask data directly for display, ignore debug output
      const subtask = parsedData.subtask;
      
      // Create clean JSON representation
      const cleanSubtask = {
        order: subtask.order,
        task: subtask.task,
        description: subtask.description,
        "Expected Output": subtask["Expected Output"],
        Type: subtask.Type,
        Status: subtask.Status,
        Answer: subtask.Answer
      };
      
      // Format content as pretty JSON string
      formattedContent = JSON.stringify(cleanSubtask, null, 2).replace(/\n/g, '<br/>');
    } else if (parsedData.output) {
      // If there's an output field, clean it
      const outputText = parsedData.output;
      
      // Remove debug lines
      const cleanOutput = outputText
        .replace(/估计的令牌使用量.*?总计:.*?\n/g, '')
        .replace(/正在发出 API 请求.*?\n/g, '')
        .replace(/速率限制超出.*?重试\.\.\.\n/g, '')
        .replace(/重置子任务.*?状态为重试中\n/g, '')
        .replace(/Debug output for.*?\n/g, '')
        .trim();
      
      formattedContent = cleanOutput.replace(/\n/g, '<br/>');
    } else {
      // If no suitable content found, use default text
      formattedContent = 'Execution completed';
    }
    
    // Generate unique session ID to distinguish subtasks from different conversations
    const conversation_id = parsedData.conversation_id || Date.now();
    
    // Determine if this is the last task
    const isLastTask = parsedData.is_final_task || 
                     (parsedData.task_index === parsedData.total_tasks - 1);
    
    console.log("Display task result, is last task:", isLastTask, {
      task_index: parsedData.task_index,
      total_tasks: parsedData.total_tasks,
      is_final_task: parsedData.is_final_task
    });
    
    // Determine waiting_user_action status - simplified logic
    // Last task never needs to wait for user action
    // Other tasks, we use the passed value, default to true if not provided
    const waitingUserAction = isLastTask 
      ? false 
      : (parsedData.waiting_user_action !== undefined
        ? parsedData.waiting_user_action
        : true);
    
    console.log("Display task result, waiting_user_action:", waitingUserAction);
    
    // Create new message
    const newMessage = { 
      role: 'assistant', 
      content: formattedContent,
      isSubtask: true,
      subtask: parsedData.subtask,
      task_index: parsedData.task_index,
      waiting_user_action: waitingUserAction,
      is_final_task: isLastTask,
      session_id: parsedData.session_id,
      total_tasks: parsedData.total_tasks || 0, // Ensure there's always a value
      conversation_id: conversation_id, // Add conversation identifier
      has_ai_dialogues: parsedData.ai_dialogues && parsedData.ai_dialogues.length > 0, // Add dialogue identifier
      isHistorical: false  
    };
    
    // Add new message instead of replacing existing message
    setChats(prevChats => {
      const newChats = [...prevChats.filter(chat => !chat.isWaitingSubtasks)]; // Remove waiting message
      newChats.push(newMessage);
      return newChats;
    });
    
    
    if (sessionId) {
      await saveMessageToSession(newMessage, sessionId);
    }
    
    // Update subtask status
    if (parsedData.subtask) {
      setAllSubtasks(prevSubtasks => {
        // Create new subtask array, preserving elements from original array
        const newSubtasks = [...prevSubtasks];
        
        // Add new subtask to appropriate position
        if (!newSubtasks[parsedData.task_index]) {
          // If position doesn't exist, ensure array has sufficient length
          while (newSubtasks.length <= parsedData.task_index) {
            newSubtasks.push(null);
          }
        }
        
        // Set subtask
        newSubtasks[parsedData.task_index] = {
          ...parsedData.subtask,
          conversation_id: conversation_id // Add conversation identifier to subtask as well
        };
        
        return newSubtasks;
      });
    }
    
    // If this is the first subtask, update currentTask information
    if (parsedData.task_index === 0) {
      setCurrentTask({
        main_task: currentTask.main_task,
        task_index: parsedData.task_index,
        waiting_user_action: waitingUserAction,
        session_id: parsedData.session_id,
        conversation_id: conversation_id,
        total_tasks: parsedData.total_tasks // Ensure total task count is also saved
      });
    }
  };

  // Handle AI dialogue flow
  const handleDialogueFlow = (taskData) => {
    console.log("Start dialogue flow, data:", taskData);
    
    // First check if there are AI dialogues
    if (!taskData.ai_dialogues || taskData.ai_dialogues.length === 0) {
      console.log("No dialogues to process, display task result directly");
      displayTaskResult(taskData);
      return;
    }
    
    // Determine if this is the last task
    const isLastTask = taskData.is_final_task || 
                     (taskData.task_index === taskData.total_tasks - 1);
                     
    // Ensure correct total_tasks value
    const totalTasks = taskData.total_tasks || allSubtasks.length;
    
    console.log("Is last task:", isLastTask, {
      task_index: taskData.task_index,
      total_tasks: totalTasks,
      is_final_task: taskData.is_final_task
    });
    
    // Only non-last tasks need to wait for user action
    const originalWaitingUserAction = !isLastTask;
    
    // Add a field to taskData to save original waiting_user_action status
    const enrichedTaskData = {
      ...taskData,
      total_tasks: totalTasks, // Ensure correct total_tasks value is saved
      original_waiting_user_action: originalWaitingUserAction,
      is_final_task: isLastTask // Ensure this flag is set correctly
    };
    
    // Initialize dialogue flow
    setCurrentAiDialogues(taskData.ai_dialogues);
    setDialogueIndex(0);
    setIsDialogueMode(true);
    setPendingTaskResult(enrichedTaskData);  // Use enhanced data
    console.log("Dialogue mode activated, showing first dialogue, saving original waiting_user_action:", originalWaitingUserAction);
  };

  // Continue next dialogue
  const handleContinueNextDialogue = () => {
    console.log("Move to next dialogue, current index:", dialogueIndex);
    // If there are more dialogues, show the next one
    if (dialogueIndex < currentAiDialogues.length - 1) {
      setDialogueIndex(dialogueIndex + 1);
    } else {
      // If all dialogues have been shown, complete the process and display result
      handleCompleteAllDialogues();
    }
  };

  // Complete all dialogue processing
  const handleCompleteAllDialogues = () => {
    console.log("Complete all dialogues, display task result, replacement index:", pendingReplacementIndex);
    console.log("Complete all dialogues, pendingTaskResult:", pendingTaskResult);
    
    // Exit dialogue mode
    setIsDialogueMode(false);
    
    // Display previously saved task result
    if (pendingTaskResult) {
      // Ensure correct total_tasks value - try multiple ways to get it
      const totalTasks = pendingTaskResult.total_tasks || allSubtasks.length || 5; // Default to at least 5
      
      // More strictly determine if this is the last task
      let isLastTask = false;
      
      // Check multiple conditions to determine if this is the last task
      if (pendingTaskResult.is_final_task) {
        isLastTask = true;
      } else if (pendingTaskResult.task_index !== undefined) {
        // Ensure numeric comparison
        const taskIndex = parseInt(pendingTaskResult.task_index);
        
        if (!isNaN(taskIndex) && taskIndex >= totalTasks - 1) {
          isLastTask = true;
        }
      }
      
      console.log("Last task judgment details:", {
        task_index: pendingTaskResult.task_index,
        total_tasks: totalTasks,
        is_final_task: pendingTaskResult.is_final_task,
        computed_isLastTask: isLastTask
      });
      
      // Key modification: Use saved original_waiting_user_action, but last task absolutely doesn't wait for user action
      const waitingUserAction = isLastTask ? false : 
        (pendingTaskResult.original_waiting_user_action !== undefined ? 
         pendingTaskResult.original_waiting_user_action : true);
      
      console.log("Calculated waiting_user_action:", waitingUserAction);
      
      // Check if there are file output updates
      const subtask = pendingTaskResult.subtask;
      if (subtask && subtask.file_output) {
        // Add file update notification
        setChats(prevChats => [
          ...prevChats,
          { 
            role: 'system', 
            content: `File content has been updated. New content: ${subtask.file_output}`,
            isFileUpdate: true,
            isHistorical: false  
          }
        ]);
      }
      
      // Key modification: Check if there's a pending replacement message index
      if (pendingReplacementIndex !== null) {
        console.log("Found pending replacement message index:", pendingReplacementIndex);
        // If there is, replace that message
        setChats(prevChats => {
          const newChats = [...prevChats];
          const formattedContent = pendingTaskResult.output?.replace(/\n/g, '<br/>') || 'Execution completed';
          
          // Ensure the index exists
          if (newChats[pendingReplacementIndex]) {
            const originalMessage = newChats[pendingReplacementIndex];
            
            // Regardless of original status, force set correct waiting_user_action
            newChats[pendingReplacementIndex] = {
              ...originalMessage,
              content: formattedContent,
              subtask: pendingTaskResult.subtask,
              waiting_user_action: waitingUserAction,
              is_final_task: isLastTask,
              total_tasks: totalTasks, // Ensure correct total_tasks setting
              isHistorical: false  
            };
            
            console.log("Replaced message, waiting_user_action:", waitingUserAction);
          } else {
            console.log("Unable to replace message: index doesn't exist");
          }
          
          return newChats;
        });
        
        // Reset replacement index
        setPendingReplacementIndex(null);
      } else {
        // If no pending replacement index, then display task result (add new message)
        console.log("No pending replacement index, adding new message");
        
        // Modify displayTaskResult function call, force set waiting_user_action and total_tasks
        const modifiedTaskResult = {
          ...pendingTaskResult,
          waiting_user_action: waitingUserAction,
          is_final_task: isLastTask,
          total_tasks: totalTasks // Ensure correct total_tasks setting
        };
        
        displayTaskResult(modifiedTaskResult);
      }
      
      setPendingTaskResult(null);
    }
  };

  const handleEditAndContinueDialogue = async () => {
    if (editingDialogue === null || !editedDialogueContent) return;
    
    setIsDialogueProcessing(true);
    console.log("Submit dialogue edit and regenerate subsequent dialogues, index:", editingDialogue, "content:", editedDialogueContent.substring(0, 50) + "...");
    
    try {
      // Validate data
      if (!currentTask.session_id) {
        throw new Error("Session ID cannot be empty");
      }
      
      // Ensure there are AI dialogues
      if (!currentAiDialogues || currentAiDialogues.length === 0) {
        throw new Error("No available AI dialogue records");
      }
      
      // Ensure dialogue index is valid
      if (editingDialogue < 0 || editingDialogue >= currentAiDialogues.length) {
        throw new Error(`Dialogue index ${editingDialogue} out of range (0-${currentAiDialogues.length-1})`);
      }
      
      // Create copy of dialogues and update edited content
      const updatedDialogues = [...currentAiDialogues];
      updatedDialogues[editingDialogue] = {
        ...updatedDialogues[editingDialogue],
        content: editedDialogueContent,
        isEdited: true
      };
      
      // Show processing message
      setChats(prevChats => [
        ...prevChats,
        { 
          role: 'system', 
          content: 'Processing dialogue modifications and updating task execution results...',
          isProcessing: true,
          isHistorical: false  
        }
      ]);
      
      // Save original waiting_user_action status to ensure it's not lost during processing
      const originalWaitingUserAction = currentTask.waiting_user_action;
      
      // Call new API endpoint to regenerate subsequent dialogues and pass current all dialogue data
      const response = await apiClient.post(
        '/regenerate-dialogues',
        {
          session_id: currentTask.session_id,
          task_index: currentTask.task_index,
          dialogue_index: editingDialogue,
          updated_content: editedDialogueContent,
          current_dialogues: updatedDialogues // Send current in-memory dialogue data
        }
      );
      
      console.log("Dialogue regeneration response:", response.data);
      
      if (response.data.success) {
        // Remove processing message
        setChats(prevChats => prevChats.filter(msg => !msg.isProcessing));
        
        // Update local dialogue status, replace original dialogues with newly generated dialogues
        setCurrentAiDialogues(response.data.ai_dialogues);
        
        // If response contains updated subtask, also update local status
        if (response.data.subtask) {
          const updatedSubtask = response.data.subtask;
          
          // Update corresponding subtask in allSubtasks array
          setAllSubtasks(prevSubtasks => {
            const newSubtasks = [...prevSubtasks];
            newSubtasks[currentTask.task_index] = updatedSubtask;
            return newSubtasks;
          });
          
          // Important modification: Update pendingTaskResult to ensure correct message is updated after dialogue completion, and preserve original waiting_user_action status
          setPendingTaskResult({
            ...response.data,
            subtask: updatedSubtask,
            session_id: currentTask.session_id,
            task_index: currentTask.task_index,
            original_waiting_user_action: originalWaitingUserAction // Save original status
          });
          
          // Check if file output has been updated
          if (updatedSubtask.file_output) {
            // Show file update notification
            setChats(prevChats => [
              ...prevChats,
              { 
                role: 'system', 
                content: `File content has been updated. New content: ${updatedSubtask.file_output}`,
                isFileUpdate: true,
                isHistorical: false  
              }
            ]);
          }
        }
        
        // Exit edit mode
        setEditingDialogue(null);
        setEditedDialogueContent('');
        
        // Show success message, use success prompt instead of error prompt
        setSuccessMessage("The dialogue has been updated and regenerated follow-up content");
        setIsSuccessModalOpen(true);
      } else {
        throw new Error(response.data.error || "Dialogue regeneration failed");
      }
    } catch (error) {
      console.error("Dialogue editing error:", error);
      
      // Build detailed error information
      let errorMessage = 'Failed to edit dialogue';
      if (error.response) {
        if (error.response.data && error.response.data.error) {
          errorMessage += `: ${error.response.data.error}`;
        } else {
          errorMessage += `: Server returned ${error.response.status} error`;
        }
      } else if (error.request) {
        errorMessage += ': Server did not respond, please check network connection';
      } else {
        errorMessage += `: ${error.message}`;
      }
      
      setError(errorMessage);
      setIsErrorModalOpen(true);
      
      // Remove processing message
      setChats(prevChats => prevChats.filter(msg => !msg.isProcessing));
    } finally {
      setIsDialogueProcessing(false);
    }
  };

  // Submit edit function
  const handleSubmitEdit = async (taskIndex, session_id, conversation_id) => {
    if (!editContent.trim()) {
      setError('Please enter the modified content');
      setIsErrorModalOpen(true);
      return;
    }

    setIsEditing(true);
    setProcessingTaskIndex(taskIndex);
    setIsTyping(true);
    
    try {
      // Get session ID
      const target_session_id = session_id || currentTask.session_id;
      
      if (!target_session_id) {
        throw new Error("Unable to submit modification: session ID not found");
      }
      
      // Find message index to modify
      const messageIndex = chats.findIndex(chat => 
        chat.isSubtask && 
        chat.task_index === taskIndex && 
        (chat.session_id === target_session_id) &&
        (chat.conversation_id === conversation_id)
      );
      
      if (messageIndex === -1) {
        throw new Error(`Cannot find subtask message with index ${taskIndex}`);
      }
      
      // Determine if this is the last task
      const targetMessage = chats[messageIndex];
      const isLastTask = targetMessage.is_final_task || 
                        (targetMessage.task_index === targetMessage.total_tasks - 1);
      
      // Modify current message to show loading status
      setChats(prevChats => {
        const newChats = [...prevChats];
        // Save original content for error recovery
        newChats[messageIndex] = {
          ...newChats[messageIndex],
          content: 'Applying your modifications and re-running...',
          waiting_user_action: false,
          originalContent: newChats[messageIndex].content  // Save original content
        };
        return newChats;
      });
      
      // Send modification request
      const response = await apiClient.post(
        '/edit-subtask',
        {
          main_task: currentTask.main_task,
          session_id: target_session_id,
          task_index: taskIndex,
          edit_content: editContent
        }
      );
      
      console.log("Received edit task response:", response.data);
      
      // Process response data
      if (response.data && response.data.subtask) {
        const parsedData = response.data;
        
        // Update current task status
        setCurrentTask({
          main_task: currentTask.main_task,
          task_index: parsedData.task_index,
          waiting_user_action: parsedData.waiting_user_action,
          session_id: parsedData.session_id
        });
        
        // Check if there are AI dialogues and enter dialogue mode
        if (parsedData.ai_dialogues && parsedData.ai_dialogues.length > 0) {
          setCurrentAiDialogues(parsedData.ai_dialogues);
          setDialogueIndex(0);
          setIsDialogueMode(true);
          setPendingTaskResult(parsedData);
          // Save pending replacement message index
          setPendingReplacementIndex(messageIndex);
        } else {
          // If no dialogues, directly replace message
          const formattedContent = parsedData.output?.replace(/\n/g, '<br/>') || 'Execution completed';
          
          // Replace original message
          setChats(prevChats => {
            const newChats = [...prevChats];
            newChats[messageIndex] = {
              role: 'assistant',
              content: formattedContent,
              isSubtask: true,
              subtask: parsedData.subtask,
              task_index: parsedData.task_index,
              waiting_user_action: parsedData.waiting_user_action,
              is_final_task: parsedData.is_final_task || isLastTask,
              session_id: parsedData.session_id || target_session_id,
              total_tasks: parsedData.total_tasks || targetMessage.total_tasks,
              conversation_id: conversation_id,
              isHistorical: false  
            };
            return newChats;
          });
          
          // Update subtask status
          if (parsedData.subtask) {
            setAllSubtasks(prevSubtasks => {
              const newSubtasks = [...prevSubtasks];
              if (newSubtasks[parsedData.task_index]) {
                newSubtasks[parsedData.task_index] = parsedData.subtask;
              }
              return newSubtasks;
            });
          }
        }
        
        // Close edit box
        setEditingTaskIndex(null);
        setEditContent('');
      } else {
        throw new Error("Subtask data missing in server response");
      }
    } catch (error) {
      console.error('Submit modification error:', error);
      
      // Build detailed error information
      let errorMessage = 'Unable to apply modification';
      if (error.response) {
        if (error.response.data && error.response.data.error) {
          errorMessage += `: ${error.response.data.error}`;
        } else {
          errorMessage += `: Server returned ${error.response.status} error`;
        }
      } else if (error.request) {
        errorMessage += ': Server did not respond, please check network connection';
      } else {
        errorMessage += `: ${error.message}`;
      }
      
      setError(errorMessage);
      setIsErrorModalOpen(true);
      
      // Restore original message status
      const messageIndex = chats.findIndex(chat => 
        chat.isSubtask && 
        chat.task_index === taskIndex &&
        (chat.session_id === session_id) &&
        (chat.conversation_id === conversation_id)
      );
      
      if (messageIndex !== -1) {
        setChats(prevChats => {
          const newChats = [...prevChats];
          // Restore original status
          if (newChats[messageIndex].originalContent) {
            newChats[messageIndex] = {
              ...newChats[messageIndex],
              content: newChats[messageIndex].originalContent,
              waiting_user_action: true
            };
            // Delete temporarily stored original content
            delete newChats[messageIndex].originalContent;
          } else {
            // If no original content, use a generic message
            newChats[messageIndex] = {
              ...newChats[messageIndex],
              content: 'Failed to submit modification, please try again',
              waiting_user_action: true
            };
          }
          return newChats;
        });
      }
    } finally {
      setIsEditing(false);
      setProcessingTaskIndex(null);
      setIsTyping(false);
    }
  };

// Handle send task 
const handleSendTask = async (e) => {
  e.preventDefault();

  if (!message) return;
  setIsTyping(true);

  try {
    // Check if we already have a session ID (from loading history)
    let currentSessionId = sessionId;
    
    // Only create a new session if we don't have one
    if (!currentSessionId) {
      currentSessionId = await ensureSession(message);
      if (!currentSessionId) {
        throw new Error('Failed to create session');
      }
    } else {
      console.log("Using existing session:", currentSessionId);
    }
    
    // Add user's message to chat history
    const userMessage = { 
      role: 'user', 
      content: message,
      isHistorical: false  
    };
    setChats((prevChats) => [...prevChats, userMessage]);
    

    await saveMessageToSession(userMessage, currentSessionId);
    
    // Add a waiting animation message showing system is processing task
    const waitingMessage = { 
      role: 'system', 
      content: 'Tasks are being split and processed',
      isProcessing: true,
      isWaitingSubtasks: true,  // Add identifier to distinguish ordinary loading from task splitting loading
      conversation_id: Date.now(), // Add unique conversation identifier
      isHistorical: false  
    };
    setChats((prevChats) => [...prevChats, waitingMessage]);
    
    // Create new task information
    const newTask = {
      main_task: message,
      task_index: -1,
      waiting_user_action: false,
      session_id: currentSessionId  
    };
    
    // Reset subtask-related status - this is a key modification
    setCurrentTask(newTask);
    // Note: Don't clear allSubtasks, but let them accumulate
    setPendingSubtasks([]); // Clear pending subtask list
    setCurrentAiDialogues([]); // Clear current AI dialogues
    setDialogueIndex(0); // Reset dialogue index
    setIsDialogueMode(false); // Exit dialogue mode
    setPendingTaskResult(null); // Clear pending task result
    
    console.log("Sending new task:", newTask);
    console.log("Using session ID:", currentSessionId);

    const token = localStorage.getItem('token');
    

    const eventSource = new EventSource(
      `${import.meta.env.VITE_API_URL}/stream-process-task?main_task=${encodeURIComponent(message)}&token=${encodeURIComponent(token)}&session_id=${encodeURIComponent(currentSessionId)}`
    );

    // 将 eventSource.onmessage 
eventSource.onmessage = async (event) => {  
  try {
    // First check if it's an end signal
    if (event.data === 'END') {
      console.log("Received end signal");
      eventSource.close();
      setIsTyping(false);
      setMessage('');
      return;
    }
    
    // Check and process possible "data: " prefix
    let jsonData = event.data;
    if (jsonData.startsWith('data: ')) {
      jsonData = jsonData.substring(6); 
    }
    
    // Parse data
    const parsedData = JSON.parse(jsonData);
    console.log("Parsed data:", parsedData);
    
    // Add unique identifier for current conversation
    const currentConversationId = Date.now();
    parsedData.conversation_id = currentConversationId;
    
    if (parsedData.error) {
      // Remove waiting message
      setChats(prevChats => prevChats.filter(chat => !chat.isWaitingSubtasks));
      
      // Handle rate limit errors specially
      if (parsedData.error.includes('rate_limit') || parsedData.error.includes('429')) {
        setError(`API rate limit exceeded. ${parsedData.retry_after ? `Please wait ${parsedData.retry_after} seconds.` : 'Please wait a moment and try again.'}`);
      } else {
        setError(parsedData.error);
      }
      
      setIsErrorModalOpen(true);
      eventSource.close();
      setIsTyping(false);
    } 
    // Process initial response containing all subtasks
    else if (parsedData.is_initial_response) {
      console.log("Received initial response containing all subtasks:", parsedData);
      console.log("Current session ID:", currentSessionId);
      console.log("Response session ID:", parsedData.session_id);
      
      // Validate session IDs match
      if (parsedData.session_id && currentSessionId && parsedData.session_id !== currentSessionId) {
        console.warn("Session ID mismatch! Using existing session ID:", currentSessionId);
        // Override the response session_id with our current one
        parsedData.session_id = currentSessionId;
      }
      
      // Only update session ID if we somehow don't have one (should not happen)
      if (!currentSessionId && parsedData.session_id) {
        console.warn("No current session ID, setting from response:", parsedData.session_id);
        setSessionId(parsedData.session_id);
        currentSessionId = parsedData.session_id;
      }
      
      // Make sure currentTask uses the correct session_id
      setCurrentTask(prevTask => ({
        ...prevTask,
        session_id: currentSessionId || parsedData.session_id,
        main_task: prevTask.main_task || message  // Ensure main_task is set
      }));
      
      // Save pending subtasks for review
      if (parsedData.all_subtasks) {
        console.log("Save pending review subtasks:", parsedData.all_subtasks);
        setPendingSubtasks(parsedData.all_subtasks);
        setIsReviewMode(true); // Enter review mode
        
        // Remove waiting message and show review prompt
        const reviewMessage = { 
          role: 'assistant', 
          content: `The task has been split into ${parsedData.all_subtasks.length} subtasks. Please review the task plan and confirm execution.`,
          isSystemMessage: true,
          conversation_id: currentConversationId,
          isHistorical: false  
        };
        
        setChats((prevChats) => [
          ...prevChats.filter(chat => !chat.isWaitingSubtasks),
          reviewMessage
        ]);
        

        if (currentSessionId) {
          await saveMessageToSession(reviewMessage, currentSessionId);
        }
        
        // Close event source, wait for user confirmation
        eventSource.close();
        setIsTyping(false);
        setMessage(''); // Clear input
      }
    } 
    // Process regular task response
    else if (parsedData.subtask) {
      console.log("Received subtask response:", parsedData);
      console.log("Current session ID:", currentSessionId);
      console.log("Response session ID:", parsedData.session_id);
      
      // Validate and ensure correct session ID
      if (parsedData.session_id && currentSessionId && parsedData.session_id !== currentSessionId) {
        console.warn("Session ID mismatch in subtask response! Using existing session ID:", currentSessionId);
        parsedData.session_id = currentSessionId;
      }
      
      // Update current task with correct session ID
      setCurrentTask(prevTask => ({
        ...prevTask,
        task_index: parsedData.task_index,
        waiting_user_action: parsedData.waiting_user_action,
        session_id: currentSessionId || parsedData.session_id,
        total_tasks: parsedData.total_tasks || prevTask.total_tasks
      }));
      
      // Check if there are AI dialogues, if so enter dialogue review mode
      if (parsedData.ai_dialogues && parsedData.ai_dialogues.length > 0) {
        console.log("There are AI dialogues, enter dialogue review mode");
        // Ensure parsedData has the correct session_id before passing to dialogue flow
        parsedData.session_id = currentSessionId || parsedData.session_id;
        handleDialogueFlow(parsedData);
        
        // Close event source, wait for user to confirm all dialogues
        eventSource.close();
        setIsTyping(false);
        setMessage(''); // Clear input
      } else {
        // If no AI dialogues, display result directly
        // Remove waiting message
        setChats(prevChats => prevChats.filter(chat => !chat.isWaitingSubtasks));
        
        // Ensure parsedData has the correct session_id
        parsedData.session_id = currentSessionId || parsedData.session_id;
        await displayTaskResult(parsedData);  
        
        // If this is the last task, close the event source
        if (parsedData.is_final_task || 
            (parsedData.task_index === parsedData.total_tasks - 1)) {
          eventSource.close();
          setIsTyping(false);
          setMessage(''); // Clear input
        }
      }
    } else {
      // Unknown response format
      console.warn("Unknown response format:", parsedData);
      eventSource.close();
      setIsTyping(false);
    }
  } catch (parseError) {
    console.error('Failed to parse JSON:', parseError, 'Raw data:', event.data);
    
    // Remove waiting message
    setChats(prevChats => prevChats.filter(chat => !chat.isWaitingSubtasks));
    
    // Provide more specific error message
// Provide more specific error message
    let errorMessage = 'Failed to process response';
    if (event.data.includes('rate_limit')) {
      errorMessage = 'API rate limit exceeded. Please wait a moment and try again.';
    } else if (parseError.message) {
      errorMessage = `Failed to process response: ${parseError.message}`;
    }
    
    setError(errorMessage);
    setIsErrorModalOpen(true);
    eventSource.close();
    setIsTyping(false);
  }
};

    eventSource.onerror = (error) => {
      console.error('EventSource failed:', error);
      
      // Remove waiting message
      setChats(prevChats => prevChats.filter(chat => !chat.isWaitingSubtasks));
      
      setError('Connection failed. Please try again later.');
      setIsErrorModalOpen(true);
      eventSource.close();
      setIsTyping(false);
    };
  } catch (error) {
    console.error('Error processing task:', error);
    
    // Remove waiting message
    setChats(prevChats => prevChats.filter(chat => !chat.isWaitingSubtasks));
    
    setError('Failed to process task. Please try again later.');
    setIsErrorModalOpen(true);
    setIsTyping(false);
  }
};

  // Add subtask review confirmation function 
  const handleConfirmSubtasks = async () => {
    setIsTyping(true);
    setIsConfirming(true); // Set confirmation button loading status
    
    try {
      // Save reviewed subtasks to backend
      console.log("Save edited subtasks to backend:", pendingSubtasks);
      
      // First, send request to save edited subtasks to backend session
      const saveResponse = await apiClient.post(
        '/continue-execution',
        {
          main_task: currentTask.main_task,
          session_id: currentTask.session_id,
          edited_subtasks: pendingSubtasks  // Send edited subtasks
        }
      );
      
      console.log("Response for saving edited subtasks:", saveResponse.data);
      
      // Save updated subtasks to local status
      setAllSubtasks(pendingSubtasks);
      
      // Add confirmation message
      const confirmMessage = { 
        role: 'system', 
        content: 'Task plan confirmed, starting execution of first subtask...',
        isHistorical: false  
      };
      setChats((prevChats) => [...prevChats, confirmMessage]);
      
      
      if (sessionId) {
        await saveMessageToSession(confirmMessage, sessionId);
      }
      
      // Force execution of first subtask using retry-subtask endpoint
      try {
        console.log("Force execution of first subtask...");
        const firstTaskResponse = await apiClient.post(
          '/retry-subtask',
          {
            main_task: currentTask.main_task,
            session_id: currentTask.session_id || saveResponse.data.session_id,
            task_index: 0  // Explicitly specify execution of first subtask
          }
        );
        
        console.log("First subtask execution result:", firstTaskResponse.data);
        
        // Process first subtask response
        let firstTaskData = firstTaskResponse.data;
        if (typeof firstTaskData === 'string' && firstTaskData.startsWith('data: ')) {
          try {
            firstTaskData = JSON.parse(firstTaskData.substring(6));
          } catch (parseError) {
            console.error("Failed to parse first subtask response:", parseError);
          }
        }
        
        if (firstTaskData && firstTaskData.subtask) {
          // Ensure task index is 0 (first task)
          const taskIndex = 0;
          
          // Update status
          setCurrentTask({
            main_task: currentTask.main_task,
            task_index: taskIndex,
            waiting_user_action: firstTaskData.waiting_user_action || false,
            session_id: firstTaskData.session_id || currentTask.session_id
          });
          
          // Check if there are AI dialogues, if so enter dialogue review mode
          if (firstTaskData.ai_dialogues && firstTaskData.ai_dialogues.length > 0) {
            console.log("First subtask has AI dialogues, enter dialogue review mode");
            handleDialogueFlow(firstTaskData);
            
            // Remove intermediate message, wait for user to confirm all dialogues
            setChats(prevChats => 
              prevChats.filter(chat => 
                !(chat.role === 'system' && chat.content === 'Task plan confirmed, starting execution of first subtask...')
              )
            );
          } else {
            // If no AI dialogues, display result directly
            // Format content
            const formattedContent = firstTaskData.output?.replace(/\n/g, '<br/>') || 'Execution completed';
            
            // Remove intermediate message and add task result
            const taskResultMessage = { 
              role: 'assistant', 
              content: formattedContent,
              isSubtask: true,
              subtask: firstTaskData.subtask,
              task_index: taskIndex,
              waiting_user_action: firstTaskData.waiting_user_action || false,
              session_id: firstTaskData.session_id || currentTask.session_id,
              total_tasks: pendingSubtasks.length,
              isHistorical: false  
            };
            
            setChats(prevChats => [
              ...prevChats.filter(chat => 
                !(chat.role === 'system' && chat.content === 'Task plan confirmed, starting execution of first subtask...')
              ),
              taskResultMessage
            ]);
            
           
            if (sessionId) {
              await saveMessageToSession(taskResultMessage, sessionId);
            }
          }
          
          // Update subtask status
          const updatedSubtasks = [...pendingSubtasks];
          updatedSubtasks[taskIndex] = firstTaskData.subtask;
          setAllSubtasks(updatedSubtasks);
        } else {
          // If no valid subtask result received
          const noResultMessage = { 
            role: 'system', 
            content: 'Task plan confirmed, but no first subtask execution result received. Please manually click the \'Continue Next Step\' button to execute the first subtask.',
            isHistorical: false  
          };
          
          setChats(prevChats => [
            ...prevChats.filter(chat => 
              !(chat.role === 'system' && chat.content=== 'Task plan confirmed, starting execution of first subtask...')
            ),
            noResultMessage
          ]);
          
          
          if (sessionId) {
            await saveMessageToSession(noResultMessage, sessionId);
          }
        }
      } catch (firstTaskError) {
        console.error("Error executing first subtask:", firstTaskError);
        
        const errorMessage = { 
          role: 'system', 
          content: 'Failed to execute first subtask. Please manually click the \'Continue Next Step\' button to retry.',
          isHistorical: false  
        };
        
        setChats(prevChats => [
          ...prevChats.filter(chat => 
            !(chat.role === 'system' && chat.content === 'Task plan confirmed, starting execution of first subtask...')
          ),
          errorMessage
        ]);
        
        
        if (sessionId) {
          await saveMessageToSession(errorMessage, sessionId);
        }
      }
      
      // Exit review mode
      setIsReviewMode(false);
      setPendingSubtasks([]);
      
    } catch (error) {
      console.error('Confirm task error:', error);
      setError('Unable to start task execution: ' + (error.response?.data?.error || error.message));
      setIsErrorModalOpen(true);
      setIsTyping(false);
    } finally {
      setIsTyping(false);
      setIsConfirming(false); // Reset status regardless of success or failure
    }
  };

  // Cancel task
  const handleCancelTask = async () => {
    // Exit review mode
    setIsReviewMode(false);
    setPendingSubtasks([]);
    
    // Add cancel message
    const cancelMessage = { 
      role: 'system', 
      content: 'Task execution has been cancelled',
      isHistorical: false 
    };
    setChats((prevChats) => [...prevChats, cancelMessage]);
    
   
    if (sessionId) {
      await saveMessageToSession(cancelMessage, sessionId);
    }
  };

  // Continue execution of next task
  const handleContinueExecution = async (task_index, session_id, conversation_id) => {
    setIsTyping(true);
    
    // Important modification: Reset dialogue-related status
    setCurrentAiDialogues([]);  // Clear current AI dialogues
    setPendingTaskResult(null);  // Clear pending task result
    setPendingReplacementIndex(null);  // Clear replacement index
    
    try {
      // Use passed session_id instead of global currentTask
      const target_session_id = session_id || currentTask.session_id;
      
      console.log(`Continue execution, using session ID: ${target_session_id}, task index: ${task_index}, conversation ID: ${conversation_id}`);
      
      if (!target_session_id) {
        throw new Error("Unable to continue execution: session ID not found");
      }
      
      // Add current task status debug information
      console.log("Current task status:", {
        main_task: currentTask.main_task,
        task_index: currentTask.task_index,
        waiting_user_action: currentTask.waiting_user_action,
        session_id: currentTask.session_id
      });
      
      // Show loading message
      const loadingMessageIndex = chats.length;
      const loadingMessage = { 
        role: 'system', 
        content: 'Processing next subtask', 
        isProcessing: true,
        conversation_id: conversation_id, // Add conversation identifier
        isHistorical: false  
      };
      setChats(prevChats => [...prevChats, loadingMessage]);
      
      try {
        // Add timeout setting and retry logic
        let retryCount = 0;
        let response;
        
        while (retryCount < 3) {
          try {
            // Send regular AJAX request
            response = await apiClient.post(
              '/continue-execution',
              {
                main_task: currentTask.main_task,
                session_id: target_session_id,
                continue_from: task_index
              }
            );
            
            // If successful, exit retry loop
            break;
          } catch (retryError) {
            retryCount++;
            console.error(`Attempt ${retryCount}/3 failed:`, retryError.message);
            
            if (retryCount >= 3) {
              // Reached maximum retry count, throw error
              throw retryError;
            }
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        
        console.log("Received continue execution response:", response.data);
        
        // Remove loading message
        setChats(prevChats => prevChats.filter((_, index) => index !== loadingMessageIndex));
        
        // Process response data
        if (response.data && response.data.subtask) {
          const parsedData = response.data;
          
          // Add conversation identifier to ensure response corresponds to same conversation as request
          parsedData.conversation_id = conversation_id;
          
          // Determine if this is the last task
          const isLastTask = parsedData.is_final_task || 
                          (parsedData.task_index === parsedData.total_tasks - 1);
                          
          // Update current task status
          setCurrentTask({
            main_task: currentTask.main_task,
            task_index: parsedData.task_index,
            waiting_user_action: !isLastTask, // Ensure correct setting of waiting_user_action
            session_id: parsedData.session_id,
            conversation_id: conversation_id
          });
          
          // Check if there are AI dialogues, if so enter dialogue review mode
          if (parsedData.ai_dialogues && parsedData.ai_dialogues.length > 0) {
            console.log("Continue execution has AI dialogues, enter dialogue review mode");
            setCurrentAiDialogues(parsedData.ai_dialogues);
            setDialogueIndex(0);
            setIsDialogueMode(true);
            setPendingTaskResult({
              ...parsedData,
              original_waiting_user_action: !isLastTask // Save original waiting_user_action status
            });
          } else {
            // If no AI dialogues, display result directly
            // Modify waiting_user_action status
            parsedData.waiting_user_action = !isLastTask;
            displayTaskResult(parsedData);
          }
        } else {
          // If response doesn't contain valid subtask data
          throw new Error("Server returned data missing subtask information");
        }
      } catch (axiosError) {
        // Log detailed error information
        console.error("Axios error details:", {
          message: axiosError.message,
          response: axiosError.response ? {
            status: axiosError.response.status,
            data: axiosError.response.data
          } : "No response",
          request: axiosError.request ? "Request sent but no response received" : "Request not sent",
          config: axiosError.config ? {
            url: axiosError.config.url,
            method: axiosError.config.method,
            timeout: axiosError.config.timeout,
            headers: axiosError.config.headers
          } : "No config information"
        });
        
        // Remove loading message and add error message
        const errorMessage = { 
          role: 'system', 
          content: `Unable to execute next task: ${axiosError.response?.data?.error || axiosError.message}`, 
          isError: true,
          conversation_id: conversation_id,  // Keep conversation identifier
          isHistorical: false  
        };
        
        setChats(prevChats => [
          ...prevChats.filter((_, index) => index !== loadingMessageIndex),
          errorMessage
        ]);
        
        
        if (sessionId) {
          await saveMessageToSession(errorMessage, sessionId);
        }
        
        throw axiosError; // Re-throw error for outer catch to handle
      }
    } catch (error) {
      console.error('Continue execution error:', error);
      
      // Build detailed error information
      let errorMessage = 'Unable to continue execution';
      if (error.response) {
        if (error.response.data && error.response.data.error) {
          errorMessage += `: ${error.response.data.error}`;
        } else {
          errorMessage += `: Server returned ${error.response.status} error`;
        }
      } else if (error.request) {
        errorMessage += ': Server did not respond, please check network connection or server status';
      } else {
        errorMessage += `: ${error.message}`;
      }
      
      setError(errorMessage);
      setIsErrorModalOpen(true);
    } finally {
      setIsTyping(false);
    }
  };

  // Retry subtask
  const handleRetrySubtask = async (task_index, session_id, conversation_id) => {
    setIsRetrying(true);
    setProcessingTaskIndex(task_index);
    setIsTyping(true);
    
    try {
      // Use passed session_id
      const target_session_id = session_id || currentTask.session_id;
      
      console.log("Retry task, using session ID:", target_session_id, "task index:", task_index);
      
      if (!target_session_id) {
        throw new Error("Unable to retry task: session ID not found");
      }
      
      // Find message index to replace
      const messageIndex = chats.findIndex(chat => 
        chat.isSubtask && 
        chat.task_index === task_index && 
        (chat.session_id === target_session_id) &&
        (chat.conversation_id === conversation_id)
      );
      
      if (messageIndex === -1) {
        throw new Error(`Cannot find subtask message with index ${task_index}`);
      }
      
      // Determine if this is the last task
      const targetMessage = chats[messageIndex];
      const isLastTask = targetMessage.is_final_task || 
                         (targetMessage.task_index === targetMessage.total_tasks - 1);
      
      // Modify current message to show loading status - key is to replace instead of adding new message
      setChats(prevChats => {
        const newChats = [...prevChats];
        newChats[messageIndex] = {
          ...newChats[messageIndex],
          content: 'Retrying subtask...',
          waiting_user_action: false,
        };
        return newChats;
      });
      
      // Send retry request
      const response = await apiClient.post(
        '/retry-subtask',
        {
          main_task: currentTask.main_task,
          session_id: target_session_id,
          task_index: task_index
        }
      );
      
      console.log("Received retry task response:", response.data);
      
      // Process response data
      if (response.data && response.data.subtask) {
        const parsedData = response.data;
        
        // Important modification: Reset dialogue-related state variables
        setCurrentAiDialogues([]);  // Clear current AI dialogues
        setPendingTaskResult(null);  // Clear pending task result
        setPendingReplacementIndex(null);  // Clear replacement index
        
        // Update current task status, ensure status consistency
        setCurrentTask({
          main_task: currentTask.main_task,
          task_index: parsedData.task_index,
          waiting_user_action: parsedData.waiting_user_action,
          session_id: parsedData.session_id,
          conversation_id: conversation_id  // Save conversation ID
        });
        
        // Check if there are AI dialogues, if so enter dialogue review mode
        if (parsedData.ai_dialogues && parsedData.ai_dialogues.length > 0) {
          console.log("Retry task has AI dialogues, enter dialogue review mode");
          setCurrentAiDialogues(parsedData.ai_dialogues);
          setDialogueIndex(0);
          setIsDialogueMode(true);
          setPendingTaskResult({
            ...parsedData,
            original_waiting_user_action: !isLastTask  // Set original waiting_user_action status
          });
          
          // Save message index
          setPendingReplacementIndex(messageIndex);
        } else {
          // Ensure correct waiting_user_action status
          const waitingUserAction = !isLastTask;
          
          // If no AI dialogues, directly update task result - this is replacement instead of addition
          const formattedContent = parsedData.output?.replace(/\n/g, '<br/>') || 'Execution completed';
          
          // Replace original message content
          setChats(prevChats => {
            const newChats = [...prevChats];
            newChats[messageIndex] = {
              role: 'assistant',
              content: formattedContent,
              isSubtask: true,
              subtask: parsedData.subtask,
              task_index: parsedData.task_index,
              waiting_user_action: waitingUserAction,  // Set correct waiting_user_action
              is_final_task: parsedData.is_final_task || isLastTask,
              session_id: parsedData.session_id || target_session_id,
              total_tasks: parsedData.total_tasks || targetMessage.total_tasks,
              conversation_id: conversation_id,
              has_ai_dialogues: false,  // Explicitly mark no AI dialogues
              isHistorical: false  
            };
            return newChats;
          });
          
          // Update subtask status
          if (parsedData.subtask) {
            setAllSubtasks(prevSubtasks => {
              const newSubtasks = [...prevSubtasks];
              if (newSubtasks[parsedData.task_index]) {
                newSubtasks[parsedData.task_index] = parsedData.subtask;
              }
              return newSubtasks;
            });
          }
        }
      } else {
        // If response doesn't contain valid subtask data
        throw new Error("Server returned data missing subtask information");
      }
    } catch (error) {
      console.error('Retry task error:', error);
      
      // Provide detailed error information
      let errorMessage = 'Unable to retry task';
      if (error.response) {
        if (error.response.data && error.response.data.error) {
          errorMessage += `: ${error.response.data.error}`;
        } else {
          errorMessage += `: Server returned ${error.response.status} error`;
        }
      } else if (error.request) {
        errorMessage += ': Server did not respond, please check network connection';
      } else {
        errorMessage += `: ${error.message}`;
      }
      
      setError(errorMessage);
      setIsErrorModalOpen(true);
    } finally {
      // Reset loading status regardless of success or failure
      setIsRetrying(false);
      setProcessingTaskIndex(null);
      setIsTyping(false);
    }
  };

  // Add subtask review confirmation function
  const handleToggleEditSubtask = (index) => {
    if (editingSubtaskIndex === index) {
      setEditingSubtaskIndex(null);
      setEditingSubtaskContent('');
    } else {
      setEditingSubtaskIndex(index);
      // Prepare initial content for editing - use JSON string representation of subtask
      setEditingSubtaskContent(JSON.stringify(pendingSubtasks[index], null, 2));
    }
  };

  // Submit subtask edit
  const handleSubmitSubtaskEdit = (index) => {
    try {
      // Parse user-edited content
      const editedSubtask = JSON.parse(editingSubtaskContent);
      
      // Update pending subtask list
      setPendingSubtasks(prevSubtasks => {
        const newSubtasks = [...prevSubtasks];
        newSubtasks[index] = editedSubtask;
        return newSubtasks;
      });
      
      // Exit edit mode
      setEditingSubtaskIndex(null);
      setEditingSubtaskContent('');
    } catch (error) {
      console.error('Parse edit content error:', error);
      setError('Unable to parse JSON format: ' + error.message);
      setIsErrorModalOpen(true);
    }
  };

  // Helper function: clean prompt text
  const cleanPromptText = (text) => {
    if (!text) return '';
    // Simple cleaning logic
    return text.replace(/\\n/g, '\n').replace(/\\"/g, '"');
  };

  // Render message function
  const renderMessage = (chat, index) => {
    // Handle special original prompt display
    if (chat.role === 'system' && chat.content && 
        (chat.content.includes('original prompt') || 
         chat.content.includes('Original prompt'))) {
      
      return (
        <div key={`original-prompt-${index}`} className="original-prompt-container">
          <div className="original-prompt-content">
            {cleanPromptText(chat.content.replace(/Original prompt[::]/, '').trim())}
          </div>
        </div>
      );
    }
    
    // Handle system messages - including file updates, loading status, warnings and errors
    if (chat.role === 'system') {
      // Handle file update notifications
      if (chat.isFileUpdate) {
        return (
          <div key={`file-update-${index}`} className="file-update-notification">
            <h4>File content has been updated</h4>
            <div className="file-content-preview">
              <pre>{chat.content.replace('File content has been updated. New content: ', '')}</pre>
            </div>
          </div>
        );
      }
      
      // Handle waiting subtask animation
      if (chat.isProcessing && chat.isWaitingSubtasks) {
        return (
          <div
            key={`system-${index}`}
            className={`system-message processing isWaitingSubtasks`}
          >
            <p className="system-text">
              {chat.content}
              <span className="spinner-dot"></span>
              <span className="spinner-dot"></span>
              <span className="spinner-dot"></span>
            </p>
          </div>
        );
      }
      
      // Handle regular system messages and various statuses
      return (
        <div 
          key={`system-${index}`} 
          className={`system-message ${chat.isWarning ? 'warning' : ''} ${chat.isError ? 'error' : ''} ${chat.isProcessing ? 'processing' : ''}`}
        >
          <p className="system-text">
            <i>{chat.content}</i>
            {chat.isProcessing && (
              <span className="loading-spinner">
                <span className="spinner-dot"></span>
                <span className="spinner-dot"></span>
                <span className="spinner-dot"></span>
              </span>
            )}
          </p>
        </div>
      );
    }
    
    // Handle user messages
    if (chat.role === 'user') {
      return (
        <div key={`user-${index}`} className={`message-container user-message ${chat.isHistorical ? 'historical-message' : ''}`}>
          <div className="message-avatar user-avatar">U</div>
          <div className="message-content">
            {typeof chat.content === 'string' ? (
              <div dangerouslySetInnerHTML={{ __html: chat.content }} />
            ) : (
              Array.isArray(chat.content) && chat.content.map((contentItem, contentIndex) => (
                <div key={contentIndex}>
                  {contentItem.type === 'text' && contentItem.text}
                  {contentItem.type === 'image_url' && (
                    <img 
                      src={contentItem.image_url.url} 
                      alt="User uploaded" 
                      style={{ maxWidth: '100%', maxHeight: '300px', marginTop: '10px' }} 
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      );
    }
    if (chat.isSubtask && chat.subtask) {
      console.log("Rendering subtask message:", {
        task_index: chat.task_index,
        total_tasks: chat.total_tasks,
        waiting_user_action: chat.waiting_user_action,
        is_final_task: chat.is_final_task,
        conversation_id: chat.conversation_id,
        isHistorical: chat.isHistorical,
        // Add conditional judgment result
        showContinueButton: chat.waiting_user_action !== false && 
                            chat.task_index < (chat.total_tasks - 1)
      });
    } 
    // Handle subtask messages
    if (chat.isSubtask && chat.subtask) {
      return (
        <div key={`assistant-${index}`} className={`message-container assistant-message ${chat.isHistorical ? 'historical-message' : ''}`}>
          <div className="message-avatar">AI</div>
          <div className="message-content">
            <div className="subtask-info">
              <div className="subtask-header">
                <span className="subtask-order">Subtask {chat.subtask.order}</span>
                <span className="subtask-title">{chat.subtask.task}</span>
                <span className={`subtask-type type-${chat.subtask.Type}`}>
                  {translateTaskType(chat.subtask.Type)}
                </span>
              </div>
              
              <div className="subtask-body">
                <div className="subtask-description">
                  <span className="info-label">Description:</span>
                  <span className="info-value">{chat.subtask.description}</span>
                </div>
                
                {chat.subtask["Expected Output"] && (
                  <div className="subtask-expected-output">
                    <span className="info-label">Expected output:</span>
                    <span className="info-value">{chat.subtask["Expected Output"]}</span>
                  </div>
                )}
                
                {chat.subtask.Status && chat.subtask.Status !== "Not yet started..." && (
                  <div className="subtask-status">
                    <span className="info-label">Execution status:</span>
                    <div className="status-content">
                      {formatJSONDisplay(simplifyStatusText(chat.subtask.Status))}
                    </div>
                  </div>
                )}
                
                {chat.subtask.Answer && (
                  <div className="subtask-status">
                    <span className="info-label">Task result:</span>
                    <div className="status-content">
                      {formatJSONDisplay(chat.subtask.Answer)}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Subtask control buttons - 检查 isHistorical 标记 */}
            {!chat.isHistorical && (
              <div className="subtask-controls">
                <button 
                  onClick={() => handleRetrySubtask(chat.task_index, chat.session_id, chat.conversation_id)}
                  className={`retry-btn ${isRetrying && processingTaskIndex === chat.task_index ? 'loading' : ''}`}
                  disabled={isRetrying || chat.isProcessing}
                >
                  {isRetrying && processingTaskIndex === chat.task_index ? (
                    <>
                      Retrying
                      <span className="loading-spinner">
                        <span className="spinner-dot"></span>
                        <span className="spinner-dot"></span>
                        <span className="spinner-dot"></span>
                      </span>
                    </>
                  ) : 'Retry'}
                </button>
                
                {/* Only show "Continue Next Step" button for non-last tasks - modified condition */}
                {chat.waiting_user_action && 
                 chat.task_index < (chat.total_tasks || allSubtasks.length || 5) - 1 && (
                  <button 
                    onClick={() => handleContinueExecution(chat.task_index, chat.session_id, chat.conversation_id)}
                    className="continue-btn"
                    disabled={isRetrying || isEditing || chat.isProcessing}
                  >
                    Continue
                  </button>
                )}
                
                <button 
                  onClick={() => toggleEditTask(chat.task_index, '', chat.session_id, chat.conversation_id)}
                  className={`edit-btn ${isEditing && processingTaskIndex === chat.task_index ? 'loading' : ''}`}
                  disabled={isRetrying || chat.isProcessing}
                >
                  {isEditing && processingTaskIndex === chat.task_index && editingTaskIndex !== chat.task_index ? (
                    <>
                      <span className="loading-spinner">
                        <span className="spinner-dot"></span>
                        <span className="spinner-dot"></span>
                        <span className="spinner-dot"></span>
                      </span>
                      Preparing to edit...
                    </>
                  ) : (editingTaskIndex === chat.task_index ? 'Editing' : 'Edit')}
                </button>
                
                {/* Add view AI dialogue button */}
                {currentAiDialogues.length > 0 && 
                 chat.task_index === currentTask.task_index && (
                  <button 
                    onClick={() => {
                      setIsDialogueMode(true);
                      setDialogueIndex(0);
                      
                      // Find current subtask message index
                      const messageIndex = chats.findIndex(msg => 
                        msg.isSubtask && 
                        msg.task_index === chat.task_index && 
                        msg.session_id === chat.session_id &&
                        msg.conversation_id === chat.conversation_id
                      );
                      
                      if (messageIndex !== -1) {
                        // Save message index to be replaced
                        setPendingReplacementIndex(messageIndex);
                      }
                    }}
                    className="view-dialogues-btn"
                    disabled={isRetrying || isEditing || chat.isProcessing}
                  >
                    View AI Dialogue
                  </button>
                )}
              </div>
            )}
            
            {!chat.isHistorical && editingTaskIndex === chat.task_index && (
              <div className="task-edit-container">
                <textarea
                  className="task-edit-textarea"
                  placeholder="Enter your code modifications or suggestions..."
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={5}
                  disabled={isEditing}
                />
                <div className="task-edit-buttons">
                  <button 
                    className={`task-edit-submit ${isEditing ? 'loading' : ''}`}
                    onClick={() => handleSubmitEdit(chat.task_index, chat.session_id, chat.conversation_id)}
                    disabled={isEditing}
                  >
                    {isEditing ? (
                      <>
                        Submitting
                        <span className="loading-spinner">
                          <span className="spinner-dot"></span>
                          <span className="spinner-dot"></span>
                          <span className="spinner-dot"></span>
                        </span>
                      </>
                    ) : 'Submit Changes'}
                  </button>
                  <button 
                    className="task-edit-cancel"
                    onClick={() => toggleEditTask(null)}
                    disabled={isEditing}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            
            {/* Show task progress */}
            <div className="task-progress">
              Subtask {chat.task_index + 1}/{chat.total_tasks || '5'}
              {!chat.waiting_user_action && chat.task_index < (chat.total_tasks - 1) ? '' : ''}
              {!chat.waiting_user_action && chat.task_index === (chat.total_tasks - 1) ? ' (Final subtask)' : ''}
            </div>
          </div>
        </div>
      );
    }
    
    // Handle regular assistant messages (non-subtask)
    return (
      <div key={`assistant-${index}`} className={`message-container assistant-message ${chat.isHistorical ? 'historical-message' : ''}`}>
        <div className="message-avatar">AI</div>
        <div className="message-content">
          <div dangerouslySetInnerHTML={{ __html: chat.content }} />
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      <Header 
        username={username} 
        toggleSidebar={toggleSidebar} 
        isSidebarOpen={isSidebarOpen}
      />
      
      <div className="app-content">
        {/* Sidebar */}
        <Sidebar 
          isOpen={isSidebarOpen}
          username={username}
          userHasEmail={userHasEmail}
          historySessions={historySessions}
          isLoadingHistory={isLoadingHistory}
          onNewChat={handleNewChat}
          onSelectHistory={handleHistoryChat}
          onDeleteHistory={handleDeleteHistory}
          onBindEmail={handleBindEmail}
          onUnbindEmail={handleUnbindEmail}
          onLogout={handleLogout}
          onFetchHistory={fetchHistorySessions}
          showBindEmailForm={showBindEmailForm}
          email={email}
          setEmail={setEmail}
          verificationCode={verificationCode}
          setVerificationCode={setVerificationCode}
          handleSendEmailVerificationCode={handleSendEmailVerificationCode}
          handleSubmitBindEmail={handleSubmitBindEmail}
        />
        
        {/* Main content area */}
        <main className="main-content">
          {isDialogueMode && currentAiDialogues.length > 0 ? (
            <AIDialogueSequence 
              dialogues={currentAiDialogues}
              currentIndex={dialogueIndex}
              onContinue={handleContinueNextDialogue}
              onEdit={(index) => {
                setEditingDialogue(index);
                setEditedDialogueContent(currentAiDialogues[index].content);
              }}
              onCompleteAll={handleCompleteAllDialogues}
            />
          ) : (
            <>
              {/* Task review panel */}
              {isReviewMode && pendingSubtasks.length > 0 && (
                <TaskReviewPanel 
                  subtasks={pendingSubtasks} 
                  onConfirm={handleConfirmSubtasks}
                  onCancel={handleCancelTask}
                  onEdit={handleToggleEditSubtask}
                  editingSubtaskIndex={editingSubtaskIndex}
                  editingSubtaskContent={editingSubtaskContent}
                  setEditingSubtaskContent={setEditingSubtaskContent}
                  handleSubmitSubtaskEdit={() => handleSubmitSubtaskEdit(editingSubtaskIndex)}
                  handleCancelSubtaskEdit={() => setEditingSubtaskIndex(null)}
                  isConfirming={isConfirming}
                />
              )}
              
              {/* Task plan in non-review mode */}
              {!isReviewMode && allSubtasks.length > 0 && (
                <TaskPlanView subtasks={allSubtasks} currentTaskIndex={currentTask.task_index} />
              )}
              
              {/* Chat history */}
              <div className="chat-messages" ref={chatHistoryRef}>
                {chats && chats.length > 0 ? (
                  chats.map((chat, index) => renderMessage(chat, index))
                ) : (
                  <div className="empty-chat">
                    <div className="welcome-container">
                      <h2>Welcome to AI Assistant</h2>
                      <p>Enter a question or task to start a conversation</p>
                      <div className="example-prompts">
                        <h3>You can try these examples:</h3>
                        <div className="prompt-buttons">
                          <button onClick={() => setMessage("Run data analysis on sklearn Iris dataset, include a plot")}>Run data analysis on sklearn Iris dataset, include a plot</button>
                          <button onClick={() => setMessage("Create a Python script to process CSV data")}>Create a Python script to process CSV data</button>
                          <button onClick={() => setMessage("Design a simple web layout")}>Design a simple web layout</button>
                          <button onClick={() => setMessage("Optimize the following SQL query: SELECT * FROM users WHERE active=1")}>Optimize SQL queries</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          
          {/* Input area */}
          <ChatInputBox 
            message={message}
            setMessage={setMessage}
            handleSubmit={handleSendTask}
            isTyping={isTyping}
          />
        </main>
      </div>
      
      {/* Edit dialogue modal */}
      {editingDialogue !== null && (
        <AIDialogueEditModal 
          dialogue={currentAiDialogues[editingDialogue]}
          editedContent={editedDialogueContent}
          setEditedContent={setEditedDialogueContent}
          onSubmit={handleEditAndContinueDialogue}
          onCancel={() => {
            setEditingDialogue(null);
            setEditedDialogueContent('');
          }}
          isProcessing={isDialogueProcessing}
        />
      )}
      
      {/* Error modal */}
      {isErrorModalOpen && (
        <ErrorModal 
          error={error}
          isOpen={isErrorModalOpen}
          onClose={handleErrorModalClose}
        />
      )}

      {/* Success prompt modal */}
      {isSuccessModalOpen && (
        <SuccessModal 
          message={successMessage}
          isOpen={isSuccessModalOpen}
          onClose={() => setIsSuccessModalOpen(false)}
        />
      )}
    </div>
  );
};  

export default Chat;