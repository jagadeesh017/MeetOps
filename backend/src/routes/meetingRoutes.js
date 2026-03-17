const express = require("express");
const router = express.Router();

const { createMeeting, getMeetings, checkAttendeeAvailability, cancelMeeting, updateMeeting, globalFreeHours } = require("../controllers/meetingController");
const auth = require("../middlewares/authmiddleware");

router.post("/", auth, createMeeting);
router.get("/", auth, getMeetings);
router.get("/free-hours", auth, globalFreeHours);
router.post("/check-availability", auth, checkAttendeeAvailability);
router.put("/:meetingId", auth, updateMeeting);
router.delete("/:meetingId", auth, cancelMeeting);

module.exports = router;
