const path = require('path');
require("dotenv").config({ path: path.join(__dirname, '../../.env') });

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Employee = require("../models/employee");
const Cluster = require("../models/groups");

if (!process.env.mongo_uri) {
  console.error("❌ Error: mongo_uri not found in .env");
  console.error("Tried path:", path.join(__dirname, '../../.env'));
  process.exit(1);
}

mongoose.connect(process.env.mongo_uri);

mongoose.connection.on("error", (err) => {
  console.error("Mongo connection error:", err.message);
  process.exit(1);
});

mongoose.connection.once("open", async () => {
  console.log("Mongo Connected for seeding");

  try {
    const password = await bcrypt.hash("123456", 10);

    // Define test users
    const users = [
      { name: "Alice Johnson", email: "alice@mail.com", department: "Engineering", password },
      { name: "Bob Smith", email: "bob@mail.com", department: "Engineering", password },
      { name: "Carol White", email: "carol@mail.com", department: "Engineering", password },
      { name: "David Brown", email: "david@mail.com", department: "HR", password },
      { name: "Emma Davis", email: "emma@mail.com", department: "HR", password },
      { name: "Frank Miller", email: "frank@mail.com", department: "Sales", password },
      { name: "Grace Lee", email: "grace@mail.com", department: "Sales", password },
      { name: "jagadeesh", email: "jagadeeshuttaravill010@gmail.com", department: "IT", password },
      { name: "Ivy Chen", email: "ivy@mail.com", department: "IT", password },
      { name: "Jack Martin", email: "jack@mail.com", department: "Marketing", password },
    ];

    // Delete existing test users - get emails from users array (dynamic)
    const testEmails = users.map(u => u.email);
    await Employee.deleteMany({ email: { $in: testEmails } });
    await Cluster.deleteMany({});

    // Create users
    const createdUsers = await Employee.insertMany(users);
    console.log(`✅ ${createdUsers.length} users created`);

    // Create clusters/groups
    const clusters = [
      {
        name: "Frontend Team",
        members: [createdUsers[0]._id, createdUsers[1]._id, createdUsers[2]._id]
      },
      {
        name: "HR Team",
        members: [createdUsers[3]._id, createdUsers[4]._id]
      },
      {
        name: "Team A",
        members: [createdUsers[0]._id, createdUsers[3]._id, createdUsers[5]._id]
      },
      {
        name: "Team B",
        members: [createdUsers[1]._id, createdUsers[4]._id, createdUsers[6]._id]
      },
      {
        name: "Sales Team",
        members: [createdUsers[5]._id, createdUsers[6]._id]
      },
      {
        name: "IT Team",
        members: [createdUsers[7]._id, createdUsers[8]._id]
      }
    ];

    await Cluster.insertMany(clusters);
    console.log(`✅ ${clusters.length} clusters created`);
    console.log("✅ Password for all users: 123456");
    
    process.exit();

  } catch (err) {
    console.error("Seed Error:", err.message);
    process.exit(1);
  }
});
