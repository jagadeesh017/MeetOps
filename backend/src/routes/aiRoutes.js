const express = require("express");
const aiController = require("../controllers/aiController");
const authMiddleware = require("../middlewares/authmiddleware");

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * Schedule meeting from natural language prompt
 * POST /api/ai/schedule-meeting
 * Body: { prompt: "string", platform: "zoom" | "google" }
 */
router.post("/schedule-meeting", aiController.scheduleFromPrompt);

/**
 * Get suggested time slots for meeting
 * POST /api/ai/suggest-times
 * Body: { attendees: ["email1", "email2"], duration: 60, startDate: "2024-02-25" }
 */
router.post("/suggest-times", aiController.getSuggestedTimes);

/**
 * Analyze request without creating meeting
 * POST /api/ai/analyze-request
 * Body: { prompt: "string" }
 */
router.post("/analyze-request", aiController.analyzeRequest);

module.exports = router;
