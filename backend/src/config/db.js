const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    if (!process.env.mongo_uri) {
      console.error('Missing mongo_uri in environment (process.env.mongo_uri)');
      return;
    }
    const conn = await mongoose.connect(process.env.mongo_uri);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;