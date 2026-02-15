require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Employee = require("../models/employee");


mongoose.connect(process.env.mongo_uri);

mongoose.connection.on("error", (err) => {
  console.error("Mongo connection error:", err.message);
  process.exit(1);
});

mongoose.connection.once("open", async () => {
  console.log("Mongo Connected for seeding");

  try {
    const password = await bcrypt.hash("123456", 10);

   
    await Employee.deleteMany({
      email: { $in: [
        "user1@mail.com",
        "user2@mail.com",
        "user3@mail.com",
        "user4@mail.com",
        "user5@mail.com"
      ]}
    });

    const users = [
      { name: "User One", email: "user1@mail.com", department: "Engineering", password },
      { name: "User Two", email: "user2@mail.com", department: "Sales", password },
      { name: "User Three", email: "user3@mail.com", department: "IT", password },
      { name: "User Four", email: "user4@mail.com", department: "HR", password },
      { name: "User Five", email: "user5@mail.com", department: "Finance", password },
    ];

    await Employee.insertMany(users);

    console.log(" 5 Dummy Users Created (password = 123456)");
    process.exit();

  } catch (err) {
    console.error(" Seed Error:", err.message);
    process.exit(1);
  }
});
