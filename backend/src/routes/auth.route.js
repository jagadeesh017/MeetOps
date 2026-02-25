const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/login', authController.login);

const auth = require("../middlewares/authmiddleware");
const Employee = require("../models/employee");

router.get("/me", auth, async (req, res) => {
  const user = await Employee.findById(req.user.id).select("-password");
  res.json(user);
});

router.get("/search", auth, async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json([]);
    }

    
    const users = await Employee.find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ]
    })
      .select('name email')
      .limit(10);

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;