// backend/models/ChatSession.js
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid'; // You'll need to install uuid: npm install uuid

const ChatSessionSchema = new mongoose.Schema({
  _id: { 
    type: String,
    default: () => uuidv4() // Generate UUID for new sessions
  },
  userId: { 
    type: String, 
    required: true,
    index: true  // 添加索引以提高查询性能
  },
  title: {
    type: String,
    default: 'New Chat'
  },
  messages: [{
    role: { 
      type: String, 
      enum: ['user', 'assistant', 'system'],
      required: true 
    },
    content: { 
      type: mongoose.Schema.Types.Mixed,  // 支持字符串或数组
      required: true 
    },
    isSubtask: {
      type: Boolean,
      default: false
    },
    subtask: {
      type: mongoose.Schema.Types.Mixed  // 存储子任务详情
    },
    task_index: Number,
    createdAt: { 
      type: Date, 
      default: Date.now 
    }
  }],
  // 存储任务相关信息
  taskInfo: {
    main_task: String,
    session_id: String,
    subtasks: [mongoose.Schema.Types.Mixed],
    currentTaskIndex: Number
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { 
  _id: false, // Disable automatic _id generation since we're providing our own
  timestamps: false // We're managing createdAt and updatedAt manually
});

// 更新 lastActivity 和 updatedAt
ChatSessionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  this.lastActivity = new Date();
  
  // 自动生成标题（使用第一条用户消息）
  if (this.title === 'New Chat' && this.messages.length > 0) {
    const firstUserMessage = this.messages.find(msg => msg.role === 'user');
    if (firstUserMessage) {
      const content = typeof firstUserMessage.content === 'string' 
        ? firstUserMessage.content 
        : firstUserMessage.content[0]?.text || 'New Chat';
      this.title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
    }
  }
  
  next();
});

const ChatSession = mongoose.model('ChatSession', ChatSessionSchema);

export default ChatSession;