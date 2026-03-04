const express = require("express");
const aiController = require("../controllers/aiController");
const authMiddleware = require("../middlewares/authmiddleware");

const router = express.Router();

router.use(authMiddleware);


router.post("/schedule-meeting", aiController.scheduleFromPrompt);
router.post("/suggest-times", aiController.getSuggestedTimes);
router.post("/analyze-request", aiController.analyzeRequest);

router.post("/delete-meeting", aiController.deleteFromPrompt);
router.post("/update-meeting", aiController.updateFromPrompt);

module.exports = router;
