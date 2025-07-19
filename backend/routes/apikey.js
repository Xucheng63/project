// backend/routes/apikey.js
import express from 'express';
import { body, validationResult } from 'express-validator';
import axios from 'axios';

const router = express.Router();


const userApiKeys = new Map();


router.post('/validate-api-key', [
  body('apiKey').notEmpty().withMessage('API Key is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { apiKey } = req.body;

  try {

    const response = await axios.get('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
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


router.post('/set-api-key', [
  body('apiKey').notEmpty().withMessage('API Key is required'),
  body('username').notEmpty().withMessage('Username is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { apiKey, username } = req.body;
  

  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  try {
  
    userApiKeys.set(username, apiKey);
    

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


router.get('/get-api-key/:username', (req, res) => {
  const { username } = req.params;
  const apiKey = userApiKeys.get(username);
  
  if (apiKey) {
    res.json({ apiKey });
  } else {
    res.status(404).json({ error: 'API key not found for user' });
  }
});

export default router;