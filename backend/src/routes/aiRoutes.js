const express = require("express");
const { chatHandler } = require("../controllers/aiController");
const authMiddleware = require("../middlewares/authmiddleware");

const router = express.Router();

router.use(authMiddleware);

// Single unified AI chat endpoint
router.post("/chat", chatHandler);

module.exports = router;
