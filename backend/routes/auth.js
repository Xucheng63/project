// backend/routes/auth.js
import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import VerificationCode from '../models/VerificationCode.js';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
const router = express.Router();

// Send verification code
router.post('/send-verification-code', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ errors: [{ msg: 'Email is required' }] });
  }

  try {
    const verificationCode = crypto.randomInt(1000, 9999).toString();

    const transporter = nodemailer.createTransport({
      host: 'smtp.qq.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Verification Code',
      text: `Your verification code is: ${verificationCode}`
    };

    await transporter.sendMail(mailOptions);

    const verification = new VerificationCode({ email, code: verificationCode });
    await verification.save();

    res.json({ msg: 'Verification code sent successfully' });
  } catch (err) {
    console.error('Error sending verification code:', err);
    res.status(500).send('Server error');
  }
});

// Register
router.post('/register', [
  body('username').isLength({ min: 5 }).withMessage('Username must be at least 5 characters long'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('email').isEmail().withMessage('Invalid email address'),
  body('verificationCode').isLength({ min: 4, max: 4 }).withMessage('Verification code must be 4 digits')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, password, email, verificationCode } = req.body;

  try {
    const verification = await VerificationCode.findOne({ email });
    if (!verification || verification.code !== verificationCode) {
      return res.status(400).json({ errors: [{ msg: 'Invalid verification code' }] });
    }

    await VerificationCode.findByIdAndDelete(verification._id);

    let user = await User.findOne({ username });
    if (user) {
      return res.status(400).json({ errors: [{ msg: 'Username already exists' }] });
    }

    user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ errors: [{ msg: 'Email already exists' }] });
    }

    user = new User({ username, password, email });
    await user.save();

    const payload = { user: { id: user.id, username: user.username } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 360000 }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: payload.user });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Login
router.post('/login', [
  body('identifier').not().isEmpty().withMessage('Username or email is required'),
  body('password').not().isEmpty().withMessage('Password is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { identifier, password } = req.body;

  try {
    let user = await User.findOne({ $or: [{ username: identifier }, { email: identifier }] });
    if (!user) {
      return res.status(400).json({ errors: [{ msg: 'Invalid credentials' }] });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ errors: [{ msg: 'Invalid credentials' }] });
    }

    const payload = { user: { id: user.id, username: user.username } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 360000 }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: payload.user });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Get current user information
router.get('/me', async (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authorization token is required' });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.user.id;

    // Query user information
    const user = await User.findById(userId).select('-password'); // Don't return password
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Fixed unbind email route response format
router.post('/unbind-email', [
  body('token').not().isEmpty().withMessage('Token is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { token } = req.body;

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.user.id;

    // Query user information
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ errors: [{ msg: 'User not found' }] });
    }

    if (!user.email) {
      return res.status(400).json({ errors: [{ msg: 'No email to unbind' }] });
    }

    // Delete all verification code records related to this user's email
    try {
      const deleteResult = await VerificationCode.deleteMany({ email: user.email });
      console.log(`Deleted ${deleteResult.deletedCount} verification codes for ${user.email} during unbind`);
    } catch (deleteError) {
      console.error('Error deleting verification codes during unbind:', deleteError);
    }

    // Update user email to null
    await User.findByIdAndUpdate(userId, { email: null });

    // Fixed: Use consistent success response format
    res.status(200).json({ message: 'Email unbound successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
});

// Fixed verify email route response format
router.post('/verify-email', [
  body('email').isEmail().withMessage('Invalid email address'),
  body('verificationCode').isLength({ min: 4, max: 4 }).withMessage('Verification code must be 4 digits'),
  body('token').not().isEmpty().withMessage('Token is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, verificationCode, token } = req.body;

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.user.id;

    // Query user information
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ errors: [{ msg: 'User not found' }] });
    }

    // Check if user has already bound an email
    if (user.email) {
      return res.status(400).json({ errors: [{ msg: 'Email is already bound' }] });
    }

    // Verify verification code
    const verification = await VerificationCode.findOne({ email, code: verificationCode });
    if (!verification) {
      return res.status(400).json({ errors: [{ msg: 'Invalid verification code' }] });
    }

    // Check if verification code has expired
    if (verification.expiresAt && new Date() > verification.expiresAt) {
      // Delete expired verification code
      await VerificationCode.deleteOne({ _id: verification._id });
      return res.status(400).json({ errors: [{ msg: 'Verification code has expired, please request a new one' }] });
    }

    // Check if email is already used by another user
    const existingUser = await User.findOne({ 
      email: email, 
      _id: { $ne: userId } 
    });
    
    if (existingUser) {
      return res.status(400).json({ errors: [{ msg: 'Email is already in use by another user' }] });
    }

    // Bind email
    user.email = email;
    await user.save();

    // Delete verification code record
    await VerificationCode.deleteOne({ _id: verification._id });

    console.log(`Email verification successful for user ${userId}, email: ${email}`);

    // Fixed: Use consistent success response format
    res.status(200).json({ message: 'Email bound successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
});

// Fixed send verification code route response format
router.post('/send-email-verification-code', [
  body('email').isEmail().withMessage('Invalid email address'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email } = req.body;

  try {
    // Check if user has already bound this email
    const user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ errors: [{ msg: 'Email is already in use' }] });
    }

    // Generate verification code
    const verificationCode = crypto.randomInt(1000, 9999).toString();

    console.log(`Generating verification code for email: ${email}`);

    // Delete all existing verification code records for this email first
    try {
      const deleteResult = await VerificationCode.deleteMany({ email: email });
      console.log(`Deleted ${deleteResult.deletedCount} existing verification codes for ${email}`);
    } catch (deleteError) {
      console.error('Error deleting existing verification codes:', deleteError);
    }

    // Send email
    const transporter = nodemailer.createTransport({
      host: 'smtp.qq.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Email Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Email Verification Code</h2>
          <p>Hello,</p>
          <p>Your verification code is:</p>
          <div style="background-color: #f0f0f0; padding: 20px; text-align: center; margin: 20px 0;">
            <span style="font-size: 24px; font-weight: bold; color: #007bff; letter-spacing: 2px;">${verificationCode}</span>
          </div>
          <p>The verification code is valid for 10 minutes, please use it promptly.</p>
          <p>If you did not request this verification code, please ignore this email.</p>
        </div>
      `
    };

    // Send email first, save verification code only after email is sent successfully
    try {
      await transporter.sendMail(mailOptions);
      console.log(`Verification email sent successfully to ${email}`);
    } catch (emailError) {
      console.error('Error sending email:', emailError);
      return res.status(500).json({ errors: [{ msg: 'Failed to send email, please check if the email address is correct' }] });
    }

    // Save verification code to database after email is sent successfully
    const verification = new VerificationCode({ 
      email, 
      code: verificationCode,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // Expires after 10 minutes
    });
    
    await verification.save();
    console.log(`Verification code saved for ${email}: ${verificationCode}`);

    // Fixed: Use consistent success response format
    res.status(200).json({ message: 'Verification code sent successfully' });
  } catch (err) {
    console.error('Error sending verification code:', err);
    
    // Provide specific error messages, use consistent error format
    let errorMessage = 'Server error';
    
    if (err.name === 'ValidationError') {
      errorMessage = 'Data validation failed, please check input information';
    } else if (err.code === 11000) {
      errorMessage = 'Verification code record conflict, please try again later';
    } else if (err.name === 'MongoNetworkError') {
      errorMessage = 'Database connection failed, please try again later';
    }
    
    res.status(500).json({ errors: [{ msg: errorMessage }] });
  }
});

// Also fixed bind email route (if you are using it)
router.post('/bind-email', [
  body('email').isEmail().withMessage('Invalid email address'),
  body('token').not().isEmpty().withMessage('Token is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, token } = req.body;

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.user.id;

    // Query user information
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ errors: [{ msg: 'User not found' }] });
    }

    // Check if user has already bound an email
    if (user.email) {
      return res.status(400).json({ errors: [{ msg: 'Email is already bound' }] });
    }

    // Bind email
    user.email = email;
    await user.save();

    // Fixed: Use consistent success response format
    res.status(200).json({ message: 'Email bound successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
});

export default router;