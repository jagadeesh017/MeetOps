const mongoose = require("mongoose");
const ClusterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },

  members: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true
    }
  ],

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Cluster", ClusterSchema);
