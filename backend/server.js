const express = require("express");
const cors = require("cors");
const meetingRoutes = require("./src/routes/meetingroutes");
require("dotenv").config();
const connectDB = require("./src/config/db");

console.log("SERVER FILE EXECUTING...");

const startServer = async () => {
  await connectDB();
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/", (req, res) => {
    res.send("MeetOps API Running");
  });
  const authRoutes = require("./src/routes/auth.route");
  app.use("/auth", authRoutes);
  const PORT = process.env.PORT || 5000;
  app.use("/meetings", meetingRoutes);

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
