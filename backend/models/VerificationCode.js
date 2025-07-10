// backend/models/VerificationCode.js
import mongoose from 'mongoose';

const VerificationCodeSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  code: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 3600 } // The verification code is valid for 1 hour
});

const VerificationCode = mongoose.model('VerificationCode', VerificationCodeSchema);

export default VerificationCode;