const mongoose = require('mongoose');
const Employee = require('./src/models/employee');
require('dotenv').config();

async function checkUser() {
    await mongoose.connect(process.env.mongo_uri);
    const users = await Employee.find({ zoomConnected: true });
    console.log('Users with Zoom connected:', users.length);
    if (users.length > 0) {
        users.forEach(u => console.log(`- ${u.email}`));
    } else {
        const all = await Employee.find({});
        console.log('All users status:');
        all.forEach(u => console.log(`- ${u.email}: Google=${u.googleConnected}, Zoom=${u.zoomConnected}`));
    }
    await mongoose.disconnect();
}

checkUser().catch(console.error);
