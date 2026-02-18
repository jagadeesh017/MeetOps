const express = require("express");
const router = express.Router();

const { createMeeting, getMeetings } = require("../controllers/meetingController");
const auth = require("../middlewares/authmiddleware");

router.post("/", auth, createMeeting);
router.get("/", auth, getMeetings);

module.exports = router;
