const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Employee = require('../models/employee');

const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

// ─── Login ────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await Employee.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    // Short-lived access token (30 min)
    const accessToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "30m" }
    );

    // Long-lived refresh token (7 days) — stored hashed in DB
    const refreshToken = crypto.randomBytes(40).toString('hex');
    user.refreshToken = hashToken(refreshToken);
    await user.save();

    res.json({
      accessToken,
      refreshToken,
      user: { id: user._id, name: user.name, email: user.email, department: user.department, settings: user.settings || {} },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── Refresh ──────────────────────────────────────────────────────────────────
exports.refresh = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ message: "No refresh token" });

  try {
    const hashed = hashToken(refreshToken);
    const user = await Employee.findOne({ refreshToken: hashed });
    if (!user) return res.status(401).json({ message: "Session expired" });

    const accessToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "30m" }
    );

    res.json({ accessToken });
  } catch (err) {
    console.error('[Auth] Refresh error:', err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── Logout ───────────────────────────────────────────────────────────────────
exports.logout = async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await Employee.findOneAndUpdate(
      { refreshToken: hashToken(refreshToken) },
      { refreshToken: null }
    ).catch(() => {});
  }
  res.json({ success: true });
};
