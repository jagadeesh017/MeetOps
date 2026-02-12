const Meeting = require("../models/meeting");

exports.createMeeting = async (req, res) => {
  try {
    const { title, startTime, endTime, organizerEmail, attendees, platform } = req.body;

    if (!title || !startTime || !endTime || !organizerEmail) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const newStart = new Date(startTime);
    const newEnd = new Date(endTime); 
    const emails = [
      organizerEmail,
      ...(attendees || []).map(a => a.email)
    ];

    const conflict = await Meeting.findOne({
      startTime: { $lt: newEnd },
      endTime: { $gt: newStart },
      $or: [
        { organizerEmail: { $in: emails } },
        { "attendees.email": { $in: emails } }
      ]
    });

    if (conflict) {
      return res.status(400).json({ message: "Time conflict for one of the attendees" });
    }
 
    const joinUrl = `https://meet.fake/${Date.now()}`;

    const meeting = await Meeting.create({
      title,
      startTime: newStart,
      endTime: newEnd,
      organizerEmail,
      attendees,
      platform,
      joinUrl
    });

    res.status(201).json(meeting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
exports.getMeetings = async (req, res) => {
  try {
    const { userEmail } = req.query;
    let query = {};
    if (userEmail) {
      query = {
        $or: [
          { organizerEmail: userEmail },
          { "attendees.email": userEmail }
        ]
      };
    }
    const meetings = await Meeting.find(query).sort({ startTime: 1 });
    
    res.json(meetings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

