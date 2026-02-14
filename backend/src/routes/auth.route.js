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

module.exports = router;