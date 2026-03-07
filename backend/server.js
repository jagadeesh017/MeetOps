require("dotenv").config();
const express = require("express");
const cors = require("cors");
const meetingRoutes = require("./src/routes/meetingRoutes");
const authRoutes = require("./src/routes/authRoutes");
const integrationRoutes = require("./src/routes/integrationRoutes");
const aiRoutes = require("./src/routes/aiRoutes");
const settingsRoutes = require("./src/routes/settingsRoutes");
const { startReminderScheduler } = require("./src/services/reminder-scheduler");
const connectDB = require("./src/config/db");

const startServer = async () => {
  await connectDB();
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/", (req, res) => {
    res.send("MeetOps API Running");
  });
  app.use("/auth", authRoutes);
  app.use("/meetings", meetingRoutes);
  app.use("/api/integrations", integrationRoutes);
  app.use("/api/ai", aiRoutes);
  app.use("/api/settings", settingsRoutes);

  const PORT = process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
  startReminderScheduler();
};

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
