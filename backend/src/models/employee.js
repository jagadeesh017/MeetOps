const mongoose = require('mongoose');
const EmployeeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  department: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },

  googleRefreshToken: { type: String, default: null },
  googleAccessToken: { type: String, default: null },
  googleConnected: { type: Boolean, default: false },
  googleEmail: { type: String, default: null },

  zoomRefreshToken: { type: String, default: null },
  zoomAccessToken: { type: String, default: null },
  zoomConnected: { type: Boolean, default: false },
  zoomEmail: { type: String, default: null },

  // Auth refresh token (hashed)
  refreshToken: { type: String, default: null },
});

module.exports = mongoose.model('Employee', EmployeeSchema);
