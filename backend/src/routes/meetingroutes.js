const express = require("express");
const router = express.Router();

const { createMeeting, getMeetings, checkAttendeeAvailability, deleteMeeting } = require("../controllers/meetingController");
const auth = require("../middlewares/authmiddleware");

router.post("/", auth, createMeeting);
router.get("/", auth, getMeetings);
router.post("/check-availability", auth, checkAttendeeAvailability);
router.delete("/:meetingId", auth, deleteMeeting);

module.exports = router;
