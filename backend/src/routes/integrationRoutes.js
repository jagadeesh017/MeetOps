const express = require('express');
const router = express.Router();
const integrationController = require('../controllers/integrationController');
const auth = require('../middlewares/authmiddleware');

// Google OAuth
router.get('/google/connect', auth, integrationController.getGoogleAuthUrl);
router.get('/google/callback', integrationController.googleCallback);

// Zoom OAuth
router.get('/google/status', auth, integrationController.getIntegrationStatus); // Using one status route for both
router.get('/zoom/connect', auth, integrationController.getZoomAuthUrl);
router.get('/zoom/callback', integrationController.zoomCallback);

router.get('/status', auth, integrationController.getIntegrationStatus);

module.exports = router;
