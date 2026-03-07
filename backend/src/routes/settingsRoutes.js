const express = require("express");
const auth = require("../middlewares/authmiddleware");
const { getMySettings, updateMySettings } = require("../controllers/settingsController");

const router = express.Router();

router.get("/me", auth, getMySettings);
router.patch("/me", auth, updateMySettings);

module.exports = router;

