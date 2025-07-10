// backend/index.js
import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import bodyParser from 'body-parser';
import cors from 'cors';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'path';
import jwt from 'jsonwebtoken';
import router from './routes/auth.js';
import ChatSession from './models/ChatSession.js';

const app = express();
const port = 8000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Configure image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// 存储用户的 API Keys（生产环境应使用数据库）
const userApiKeys = new Map();

// 中间件：从 token 中提取用户名
const extractUsername = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.username = decoded.user.username;
    } catch (err) {
      console.error('Invalid token:', err);
    }
  }
  
  next();
};

app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }
  const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url: imageUrl });
});

app.use('/uploads', express.static('uploads'));

// API Key 管理路由
// 验证 API Key 是否有效
app.post('/api/validate-api-key', async (req, res) => {
  const { apiKey } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: 'API Key is required' });
  }

  try {
    // 调用 OpenAI API 验证 key 是否有效
    const response = await axios.get('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 5000
    });

    if (response.status === 200) {
      res.json({ valid: true });
    } else {
      res.json({ valid: false });
    }
  } catch (error) {
    console.error('API Key validation error:', error.message);
    res.json({ valid: false });
  }
});

// 设置用户的 API Key
app.post('/api/set-api-key', extractUsername, async (req, res) => {
  const { apiKey } = req.body;
  const username = req.username || req.body.username;
  
  if (!apiKey || !username) {
    return res.status(400).json({ error: 'API Key and username are required' });
  }

  try {
    // 在生产环境中，应该加密存储 API Key
    userApiKeys.set(username, apiKey);
    
    // 更新 Python 后端的 API Key
    const pythonResponse = await axios.post('http://localhost:8001/update-api-key', {
      username,
      apiKey
    });

    if (pythonResponse.data.success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to update API key in Python backend' });
    }
  } catch (error) {
    console.error('Error setting API key:', error);
    res.status(500).json({ error: 'Failed to set API key' });
  }
});

// 获取用户的 API Key（内部使用）
app.get('/api/get-api-key/:username', (req, res) => {
  const { username } = req.params;
  const apiKey = userApiKeys.get(username);
  
  if (apiKey) {
    res.json({ apiKey });
  } else {
    res.status(404).json({ error: 'API key not found for user' });
  }
});

// 创建新的聊天会话
app.post('/api/sessions', extractUsername, async (req, res) => {
  const { title, firstMessage } = req.body;
  const username = req.username;
  
  if (!username) {
    return res.status(401).json({ error: 'User not authenticated' });
  }
  
  try {
    const session = new ChatSession({
      userId: username,
      title: title || 'New Chat',
      messages: firstMessage ? [{
        role: 'user',
        content: firstMessage,
        createdAt: new Date()
      }] : []
    });
    
    await session.save();
    res.json({ sessionId: session._id, session });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// 更新聊天会话
app.put('/api/sessions/:sessionId', extractUsername, async (req, res) => {
  const { sessionId } = req.params;
  const { messages, taskInfo, title } = req.body;
  const username = req.username;
  
  try {
    const session = await ChatSession.findOne({ 
      _id: sessionId, 
      userId: username 
    });
    
    if (!session) {
      // Instead of 404, create a new session with this ID
      const newSession = new ChatSession({
        _id: sessionId,
        userId: username,
        messages: messages || [],
        taskInfo: taskInfo || {},
        title: title || 'New Chat'
      });
      
      await newSession.save();
      return res.json({ success: true, session: newSession });
    }
    
    // Update existing session
    if (messages) {
      session.messages = messages;
    }
    
    if (taskInfo) {
      session.taskInfo = taskInfo;
    }
    
    if (title) {
      session.title = title;
    }
    
    await session.save();
    res.json({ success: true, session });
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// 添加单条消息到会话
app.post('/api/sessions/:sessionId/messages', extractUsername, async (req, res) => {
  const { sessionId } = req.params;
  const { message } = req.body;
  const username = req.username;
  
  try {
    const session = await ChatSession.findOne({ 
      _id: sessionId, 
      userId: username 
    });
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    session.messages.push({
      ...message,
      createdAt: new Date()
    });
    
    await session.save();
    res.json({ success: true, session });
  } catch (error) {
    console.error('Error adding message:', error);
    res.status(500).json({ error: 'Failed to add message' });
  }
});

// 获取用户的所有会话
app.get('/api/sessions', extractUsername, async (req, res) => {
  const username = req.username;
  const { limit = 20, skip = 0 } = req.query;
  
  try {
    const sessions = await ChatSession.find({ userId: username })
      .sort({ lastActivity: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .select('title createdAt lastActivity messages taskInfo');
    
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// 获取单个会话详情
app.get('/api/sessions/:sessionId', extractUsername, async (req, res) => {
  const { sessionId } = req.params;
  const username = req.username;
  
  try {
    const session = await ChatSession.findOne({ 
      _id: sessionId, 
      userId: username 
    });
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json(session);
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// 删除会话
app.delete('/api/sessions/:sessionId', extractUsername, async (req, res) => {
  const { sessionId } = req.params;
  const username = req.username;
  
  try {
    const result = await ChatSession.deleteOne({ 
      _id: sessionId, 
      userId: username 
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// 搜索会话
app.get('/api/sessions/search', extractUsername, async (req, res) => {
  const { query } = req.query;
  const username = req.username;
  
  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }
  
  try {
    const sessions = await ChatSession.find({
      userId: username,
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { 'messages.content': { $regex: query, $options: 'i' } }
      ]
    })
    .sort({ lastActivity: -1 })
    .limit(20)
    .select('title createdAt lastActivity messages');
    
    res.json(sessions);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// backend/index.js

app.get('/stream-process-task', async (req, res) => {
  const { main_task, token, session_id } = req.query;  // Add session_id parameter

  if (!main_task) {
    return res.status(400).json({ error: 'Main task is required' });
  }

  // 从 token 中提取用户名
  let username = null;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      username = decoded.user.username;
      console.log('Extracted username from token:', username);
    } catch (err) {
      console.error('Invalid token:', err);
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  // Set response headers to support streaming
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  try {
    // Log the session_id being used
    console.log('Stream process task with session_id:', session_id || 'None (will create new)');
    
    // Build request body for Python backend
    const requestBody = {
      main_task,
      username
    };
    
    // Only add session_id if it exists
    if (session_id && session_id !== 'null' && session_id !== 'undefined') {
      requestBody.session_id = session_id;
    }
    
    console.log('Calling Python backend with:', requestBody);
    
    // Call Python backend service with username and optional session_id
    const response = await axios.post('http://localhost:8001/process-task', 
      requestBody, 
      {
        responseType: 'stream'
      }
    );

    // If Python backend returns streaming response, forward directly to client
    response.data.on('data', (chunk) => {
      res.write(`data: ${chunk}\n\n`);
    });

    response.data.on('end', () => {
      res.end('data: END\n\n');
    });
    
    response.data.on('error', (error) => {
      console.error('Stream error:', error);
      res.end(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    });
    
  } catch (error) {
    console.error('Error processing task:', error);
    
    // If connection to Python backend fails
    if (error.code === 'ECONNREFUSED') {
      res.end(`data: ${JSON.stringify({ 
        error: 'Python backend service is not running. Please start the Python service on port 8001.' 
      })}\n\n`);
    } else if (error.response) {
      // If Python backend returned an error
      res.end(`data: ${JSON.stringify({ 
        error: error.response.data?.error || 'Python backend error',
        details: error.response.data 
      })}\n\n`);
    } else {
      // Other errors
      res.end(`data: ${JSON.stringify({ 
        error: error.message || 'Unknown error occurred' 
      })}\n\n`);
    }
  }
});

// 注意：这个路由已经被移除，因为我们现在使用新的会话管理系统
// 原来的 "/" 路由可以删除或者改造成兼容旧版本的形式

app.use('/api/auth', router);

// 注意：这个路由也可以改造成使用新的会话系统
app.get("/sessions", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    const sessions = await ChatSession.find({ userId }).sort({ createdAt: -1 });
    res.json(sessions);
  } catch (error) {
    console.error("Error fetching chat sessions:", error);
    res.status(500).json({ error: error.message });
  }
});

// Handle continue execution - using POST
app.post('/continue-execution', extractUsername, async (req, res) => {
  const { main_task, session_id, continue_from, edited_subtasks } = req.body;
  const username = req.username;
  
  console.log("Continue execution request details:", { 
    main_task, 
    session_id, 
    continue_from, 
    has_edited_subtasks: !!edited_subtasks,
    continue_from_type: typeof continue_from,
    username
  });
  
  if (!main_task || !session_id) {
    console.error("Missing parameters:", { main_task, session_id });
    return res.status(400).json({ error: 'Required parameters missing' });
  }

  try {
    // If edited subtasks array is provided, save them first
    if (edited_subtasks && Array.isArray(edited_subtasks)) {
      console.log("Received edited subtasks, saving to Python backend...");
      
      try {
        // Call Python backend to save edited subtasks
        const saveResponse = await axios.post('http://localhost:8001/process-task', {
          main_task,
          session_id,
          edited_subtasks,
          username
        });
        
        console.log("Successfully saved edited subtasks:", saveResponse.data);
        
        // If continue_from is not provided or is -1, only save tasks without execution
        if (continue_from === undefined || continue_from === -1) {
          return res.json(saveResponse.data);
        }
      } catch (pythonError) {
        console.error('Failed to save edited subtasks:', pythonError.message);
        if (pythonError.response) {
          console.error('Python error details:', pythonError.response.data);
        }
        return res.status(500).json({
          error: 'Failed to save edited subtasks',
          details: pythonError.message,
          pythonResponse: pythonError.response?.data
        });
      }
    }
    
    // Call Python backend service, not using streaming response
    console.log(`Calling Python backend to process subtask, continue_from: ${continue_from}, calculated index: ${parseInt(continue_from) + 1}`);
    
    try {
      const response = await axios.post('http://localhost:8001/process-task', {
        main_task,
        session_id,
        continue_from: continue_from !== undefined ? parseInt(continue_from) + 1 : 0,
        username
      }, {
        timeout: 600000 // Set 60 second timeout
      });
  
      console.log("Continue execution successful, response status:", response.status);
      console.log("Continue execution successful, response data summary:", {
        subtask: response.data.subtask ? {
          task: response.data.subtask.task,
          order: response.data.subtask.order,
          Type: response.data.subtask.Type,
          has_ai_dialogues: !!response.data.subtask.ai_dialogues
        } : null,
        task_index: response.data.task_index,
        total_tasks: response.data.total_tasks
      });
      
      // Return JSON response directly
      return res.json(response.data);
    } catch (pythonError) {
      console.error('Python backend error:', pythonError.message);
      
      // Provide more detailed error information
      let errorDetails = {
        message: pythonError.message
      };
      
      if (pythonError.response) {
        errorDetails.status = pythonError.response.status;
        errorDetails.data = pythonError.response.data;
        
        // Return Python backend error status and data
        return res.status(pythonError.response.status).json({
          error: 'Python backend error',
          details: pythonError.response.data
        });
      } else if (pythonError.request) {
        // Request was made but no response received
        errorDetails.request = 'Request was made but no response received';
        
        return res.status(504).json({
          error: 'Python backend no response',
          details: errorDetails
        });
      } else {
        // Problem occurred during request setup
        return res.status(500).json({
          error: 'Python request setup error',
          details: errorDetails
        });
      }
    }
  } catch (error) {
    console.error('Error during continue execution:', error.message);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack
    });
  }
});

// Handle retry task - using POST
app.post('/retry-subtask', extractUsername, async (req, res) => {
  const { main_task, session_id, task_index } = req.body;
  const username = req.username;
  
  console.log("Retry task request details:", { 
    main_task, 
    session_id, 
    task_index,
    task_index_type: typeof task_index,
    username
  });
  
  if (!main_task || task_index === undefined || !session_id) {
    console.error("Missing parameters:", { main_task, session_id, task_index });
    return res.status(400).json({ error: 'Required parameters missing' });
  }

  try {
    // Call Python backend service, not using streaming response
    console.log(`Calling Python backend to retry subtask, task_index: ${task_index}`);
    
    try {
      const response = await axios.post('http://localhost:8001/process-task', {
        main_task,
        session_id,
        retry_task: parseInt(task_index),
        username
      }, {
        timeout: 600000 // Set 60 second timeout
      });
  
      console.log("Retry task successful, response status:", response.status);
      console.log("Retry task successful, response data summary:", {
        subtask: response.data.subtask ? {
          task: response.data.subtask.task,
          order: response.data.subtask.order,
          Type: response.data.subtask.Type
        } : null,
        task_index: response.data.task_index
      });
      
      // Return JSON response directly
      return res.json(response.data);
    } catch (pythonError) {
      console.error('Python backend error:', pythonError.message);
      
      if (pythonError.response) {
        console.error('Python error details:', pythonError.response.data);
        return res.status(pythonError.response.status).json({
          error: 'Python backend error',
          details: pythonError.response.data
        });
      } else {
        return res.status(500).json({
          error: 'Failed to connect to Python backend',
          details: pythonError.message
        });
      }
    }
  } catch (error) {
    console.error('Error during retry task:', error.message);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack
    });
  }
});

// Handle edit task
app.post('/edit-subtask', extractUsername, async (req, res) => {
  const { main_task, session_id, task_index, edit_content } = req.body;
  const username = req.username;
  
  console.log("Edit task request:", { 
    main_task, 
    session_id, 
    task_index,
    edit_content_length: edit_content?.length,
    username
  });
  
  if (!main_task || task_index === undefined || !session_id || !edit_content) {
    console.error("Missing parameters:", { main_task, session_id, task_index, edit_content_exists: !!edit_content });
    return res.status(400).json({ error: 'Required parameters missing' });
  }

  try {
    // Call Python backend service, not using streaming response
    const response = await axios.post('http://localhost:8001/process-task', {
      main_task,
      session_id,
      task_index: parseInt(task_index),
      edit_content: edit_content,
      username
    });

    console.log("Edit task successful, response:", response.data);
    
    // Return JSON response directly
    return res.json(response.data);
  } catch (error) {
    console.error('Error editing subtask:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/process-task', extractUsername, async (req, res) => {
  const { main_task, session_id, edited_subtasks } = req.body;
  const username = req.username;

  if (!main_task) {
    return res.status(400).json({ error: 'Main task is required' });
  }

  try {
    // Call Python backend service
    const response = await axios.post('http://localhost:8001/process-task', {
      main_task,
      session_id,
      edited_subtasks,
      username
    });

    // Return Python backend response directly
    return res.json(response.data);
  } catch (error) {
    console.error('Error processing task:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Update AI dialogue
app.post('/update-ai-dialogue', extractUsername, async (req, res) => {
  const { session_id, task_index, dialogue_index, updated_content } = req.body;
  const username = req.username;
  
  console.log("Update AI dialogue request:", { 
    session_id, 
    task_index, 
    dialogue_index,
    updated_content_length: updated_content?.length,
    username
  });
  
  if (!session_id || task_index === undefined || dialogue_index === undefined || !updated_content) {
    console.error("Missing parameters:", { session_id, task_index, dialogue_index, updated_content_exists: !!updated_content });
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // Call Python backend service, not using streaming response
    const response = await axios.post('http://localhost:8001/update-ai-dialogue', {
      session_id,
      task_index: parseInt(task_index),
      dialogue_index: parseInt(dialogue_index),
      updated_content,
      username
    });

    console.log("Update AI dialogue successful, response:", response.data);
    
    // Return Python backend response directly
    return res.json(response.data);
  } catch (error) {
    console.error('Error updating AI dialogue:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Regenerate dialogues
app.post('/regenerate-dialogues', extractUsername, async (req, res) => {
  const { session_id, task_index, dialogue_index, updated_content } = req.body;
  const username = req.username;
  
  console.log("Regenerate dialogue request details:");
  console.log(JSON.stringify({ ...req.body, username }, null, 2));
  
  // Parameter validation
  if (!session_id || task_index === undefined || dialogue_index === undefined || !updated_content) {
    const missingParams = [];
    if (!session_id) missingParams.push("session_id");
    if (task_index === undefined) missingParams.push("task_index");
    if (dialogue_index === undefined) missingParams.push("dialogue_index");
    if (!updated_content) missingParams.push("updated_content");
    
    const errorMsg = `Missing required parameters: ${missingParams.join(', ')}`;
    console.error(errorMsg);
    return res.status(400).json({ error: errorMsg });
  }

  try {
    // Call Python backend
    const response = await axios.post('http://localhost:8001/regenerate-dialogues', {
      session_id,
      task_index: parseInt(task_index),
      dialogue_index: parseInt(dialogue_index),
      updated_content,
      username
    });
    
    console.log("Python backend response status:", response.status);
    console.log("Python backend response data:", response.data);
    
    return res.json(response.data);
  } catch (error) {
    console.error('Error regenerating dialogues:', error.message);
    
    // Enhanced error logging
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
      return res.status(error.response.status).json({
        error: error.response.data.error || 'Error from Python backend',
        detail: error.response.data
      });
    }
    
    return res.status(500).json({ error: error.message });
  }
});
app.post('/api/sessions', extractUsername, async (req, res) => {
  const { title, firstMessage, sessionId } = req.body; // Accept sessionId from frontend
  const username = req.username;
  
  if (!username) {
    return res.status(401).json({ error: 'User not authenticated' });
  }
  
  try {
    // Check if session already exists (in case of duplicate requests)
    if (sessionId) {
      const existingSession = await ChatSession.findById(sessionId);
      if (existingSession) {
        return res.json({ sessionId: existingSession._id, session: existingSession });
      }
    }
    
    const session = new ChatSession({
      _id: sessionId || undefined, // Use provided sessionId or let schema generate one
      userId: username,
      title: title || 'New Chat',
      messages: firstMessage ? [{
        role: 'user',
        content: firstMessage,
        createdAt: new Date()
      }] : []
    });
    
    await session.save();
    res.json({ sessionId: session._id, session });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.on('connected', () => {
  console.log('Mongoose is connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

app.listen(port, () => {
  console.log(`listening on port ${port}`);
});