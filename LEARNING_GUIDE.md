# MeetOps - Complete Beginner's Learning Guide

## 🎯 What is MeetOps?
MeetOps is a **meeting scheduling application** that helps users:
- Schedule meetings on Zoom or Google Meet
- Manage attendees and meeting invitations
- Check availability before scheduling
- View all their meetings in a calendar

---

## 📚 Important Terms for Beginners

### Backend Terms
- **Backend**: The "brain" of your app - handles data, logic, and talks to databases
- **Frontend**: The "face" of your app - what users see and interact with (website/UI)
- **API (Application Programming Interface)**: A way for frontend and backend to talk to each other
- **Endpoint**: A specific URL that does one thing (like `/meetings` to get all meetings)
- **HTTP Methods**: 
  - `GET` = Read/Fetch data (like reading a book)
  - `POST` = Create new data (like writing a new book)
  - `PUT/PATCH` = Update existing data (like editing a book)
  - `DELETE` = Remove data (like throwing away a book)

### Database Terms
- **Database (DB)**: Where all your data is stored permanently (like a filing cabinet)
- **MongoDB**: A type of database that stores data as "documents" (like JSON objects)
- **Schema**: A blueprint that defines what data can be stored (like a form template)
- **Model**: Code that lets you interact with database (create, read, update, delete)
- **Query**: Asking the database for specific data

### Authentication Terms
- **Authentication**: Proving who you are (like showing ID)
- **JWT (JSON Web Token)**: A secure pass that proves you're logged in
- **Middleware**: Code that runs BEFORE your main function (like a security guard checking tickets)
- **Session**: Keeping you logged in across multiple pages

### Integration Terms
- **OAuth**: A secure way to connect to other services (like "Sign in with Google")
- **Access Token**: A temporary key to use someone's Google/Zoom account
- **Refresh Token**: A long-lasting key to get new access tokens when they expire
- **API Integration**: Connecting your app to other services (Google, Zoom)

---

## 🏗️ Project Structure - The Big Picture

```
MeetOps/
├── backend/          ← The "server" - handles all logic and data
│   ├── server.js     ← Starting point - runs the server
│   ├── src/
│   │   ├── config/        ← Settings (database connection)
│   │   ├── models/        ← Data blueprints (what a meeting/user looks like)
│   │   ├── controllers/   ← The "brain" - business logic
│   │   ├── routes/        ← URL paths (what happens when user visits /meetings)
│   │   ├── middlewares/   ← Security guards (check if user is logged in)
│   │   └── services/      ← Helper functions (talk to Zoom, Google)
│
└── frontend/         ← The "website" - what users see
    ├── src/
    │   ├── pages/         ← Full pages (Dashboard, Login, etc.)
    │   ├── components/    ← Reusable UI pieces (buttons, forms)
    │   ├── services/      ← Talk to backend (fetch data)
    │   └── context/       ← Share data across pages (who's logged in)
```

---

## 🔄 How Does a Request Flow? (The Journey)

Let's trace what happens when a user **creates a meeting**:

### Step 1: User Clicks "Create Meeting" Button
**File**: `frontend/src/components/ScheduleMeeting.jsx`
```
User fills form → Clicks "Send" → handleSubmit() function runs
```

### Step 2: Frontend Sends Request to Backend
**File**: `frontend/src/services/api.js`
```javascript
export const createMeeting = async (meetingData) => {
    const response = await api.post("/meetings", meetingData);
    return response.data;
};
```
**What happens**: 
- Sends POST request to `http://localhost:5000/meetings`
- Includes JWT token in header (proves user is logged in)
- Sends meeting data (title, time, attendees, etc.)

### Step 3: Backend Receives Request - Route
**File**: `backend/src/routes/meetingroutes.js`
```javascript
router.post("/", auth, createMeeting);
```
**What happens**:
- Request arrives at `/meetings` endpoint
- `auth` middleware runs FIRST (checks if user is logged in)
- If valid, passes to `createMeeting` controller

### Step 4: Middleware Checks Authentication
**File**: `backend/src/middlewares/authmiddleware.js`
```javascript
// Checks if JWT token is valid
// If valid: allows request to continue
// If invalid: returns error "Unauthorized"
```

### Step 5: Controller Does the Work
**File**: `backend/src/controllers/meetingController.js`
```javascript
exports.createMeeting = async (req, res) => {
    // 1. Get data from request
    const { title, startTime, attendees } = req.body;
    
    // 2. Validate data (check if valid)
    
    // 3. Check for conflicts (is user busy?)
    
    // 4. Create Zoom/Google Meet link
    
    // 5. Save to database
    
    // 6. Send email invites
    
    // 7. Send response back to frontend
    return res.status(201).json(meeting);
};
```

### Step 6: Service Creates Zoom/Google Meeting
**File**: `backend/src/services/zoom-service.js` OR `google-meet-service.js`
```javascript
// Uses Zoom/Google API to create actual meeting
// Returns meeting link (join URL)
```

### Step 7: Save to Database
**File**: `backend/src/models/meeting.js` (defines structure)
```javascript
const meeting = await Meeting.create({
    title: "Team Standup",
    startTime: "2026-02-22T10:00:00Z",
    attendees: [...],
    joinUrl: "https://zoom.us/j/123456"
});
```

### Step 8: Response Goes Back to Frontend
```
Backend → Frontend → User sees "Meeting created!" → Modal closes
```

---

## 📂 Understanding Each Folder in Detail

### 1️⃣ **backend/src/models/** - Data Blueprints

**Purpose**: Define what data looks like and can be stored

**Example**: `meeting.js`
```javascript
const MeetingSchema = new mongoose.Schema({
  title: { type: String, required: true },    // Must have a title
  startTime: { type: Date, required: true },  // Must have start time
  attendees: [AttendeeSchema],                // Array of attendees
  joinUrl: { type: String }                   // Zoom/Meet link
});
```

**Think of it as**: A form template - every meeting MUST have these fields

---

### 2️⃣ **backend/src/routes/** - URL Mapping

**Purpose**: Map URLs to functions (when someone visits `/meetings`, what happens?)

**Example**: `meetingroutes.js`
```javascript
router.get("/", auth, getMeetings);        // GET /meetings → fetch all
router.post("/", auth, createMeeting);     // POST /meetings → create new
router.post("/check-availability", auth, checkAttendeeAvailability);
```

**Think of it as**: A receptionist directing visitors to the right office

---

### 3️⃣ **backend/src/controllers/** - Business Logic

**Purpose**: The actual work happens here (the "brain")

**Example**: `meetingController.js`
- `createMeeting()` - Creates meetings
- `getMeetings()` - Fetches meetings
- `checkAttendeeAvailability()` - Checks if people are busy

**Think of it as**: The manager who does the actual work

---

### 4️⃣ **backend/src/middlewares/** - Security Guards

**Purpose**: Run checks BEFORE main functions

**Example**: `authmiddleware.js`
```javascript
// Every request goes through this first
// Checks: Is user logged in? Is token valid?
// If yes: continue to controller
// If no: return error 401 Unauthorized
```

**Think of it as**: Bouncer at a club checking IDs

---

### 5️⃣ **backend/src/services/** - External Helpers

**Purpose**: Talk to external services (Zoom, Google, Email)

**Files**:
- `zoom-service.js` - Creates Zoom meetings
- `google-meet-service.js` - Creates Google Meet meetings
- `email-invite-service.js` - Sends email invitations

**Think of it as**: Phone calls to other companies for help

---

### 6️⃣ **frontend/src/pages/** - Full Pages

**Purpose**: Complete pages users see

**Files**:
- `Login.jsx` - Login page
- `Dashboard.jsx` - Main dashboard with integrations
- `MyMeetings.jsx` - View all meetings

**Think of it as**: Different rooms in a house

---

### 7️⃣ **frontend/src/components/** - Reusable UI Pieces

**Purpose**: Small, reusable parts of UI

**Files**:
- `ScheduleMeeting.jsx` - Modal to create meeting
- `CustomCalendar.jsx` - Calendar component

**Think of it as**: LEGO blocks you reuse everywhere

---

### 8️⃣ **frontend/src/services/** - Talk to Backend

**Purpose**: Functions that call backend APIs

**Example**: `api.js`
```javascript
export const getMeetings = async (userEmail) => {
    const response = await api.get(`/meetings?userEmail=${userEmail}`);
    return response.data;
};
```

**Think of it as**: Making phone calls to backend

---

## 🛠️ How to Add a New Feature (Step-by-Step)

Let's say you want to add a feature: **"Delete a meeting"**

### Step 1: Plan
Ask yourself:
- What data do I need? (meeting ID)
- What should happen? (Remove from database)
- Who can do this? (Only organizer or admin)

### Step 2: Backend - Add Model Method (if needed)
Usually not needed - Mongoose has `.deleteOne()` built-in

### Step 3: Backend - Add Controller Function
**File**: `backend/src/controllers/meetingController.js`
```javascript
exports.deleteMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;  // Get ID from URL
    const userEmail = req.user.email;   // Get logged-in user
    
    // Find meeting
    const meeting = await Meeting.findById(meetingId);
    
    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }
    
    // Check if user is organizer
    if (meeting.organizerEmail !== userEmail) {
      return res.status(403).json({ error: "Only organizer can delete" });
    }
    
    // Delete meeting
    await Meeting.deleteOne({ _id: meetingId });
    
    return res.json({ message: "Meeting deleted successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
```

### Step 4: Backend - Add Route
**File**: `backend/src/routes/meetingroutes.js`
```javascript
router.delete("/:meetingId", auth, deleteMeeting);
```
This means: `DELETE /meetings/12345` will call `deleteMeeting()`

### Step 5: Frontend - Add API Function
**File**: `frontend/src/services/api.js`
```javascript
export const deleteMeeting = async (meetingId) => {
    const response = await api.delete(`/meetings/${meetingId}`);
    return response.data;
};
```

### Step 6: Frontend - Add UI Button
**File**: `frontend/src/pages/MyMeetings.jsx`
```javascript
const handleDelete = async (meetingId) => {
    if (confirm("Are you sure you want to delete?")) {
        try {
            await deleteMeeting(meetingId);
            alert("Meeting deleted!");
            // Refresh meetings list
            fetchMeetings();
        } catch (err) {
            alert("Failed to delete: " + err.message);
        }
    }
};

// In your JSX:
<button onClick={() => handleDelete(meeting._id)}>
    Delete
</button>
```

### Step 7: Test
1. Start backend: `cd backend && npm start`
2. Start frontend: `cd frontend && npm run dev`
3. Login → Go to My Meetings → Click Delete → Check if it works!

---

## 🔐 How Authentication Works (Login Flow)

### When User Logs In:

**1. User enters email/password**
```
frontend/src/pages/Login.jsx
```

**2. Frontend sends to backend**
```javascript
POST /auth/login
Body: { email: "user@example.com", password: "secret123" }
```

**3. Backend checks credentials**
```javascript
// backend/src/controllers/authController.js
const user = await Employee.findOne({ email });
const isValid = await bcrypt.compare(password, user.password);
```

**4. If valid, create JWT token**
```javascript
const token = jwt.sign(
    { id: user._id, email: user.email },
    "secret_key",
    { expiresIn: "7d" }
);
```

**5. Send token back to frontend**
```javascript
return res.json({ token, user });
```

**6. Frontend saves token**
```javascript
localStorage.setItem("token", token);
```

**7. Every future request includes token**
```javascript
headers: { Authorization: `Bearer ${token}` }
```

**8. Middleware validates token on every request**
```javascript
// Extracts user info from token
// Attaches to req.user
// Controller can access: req.user.email
```

---

## 🔗 How Zoom/Google Integration Works

### Connecting Zoom Account:

**1. User clicks "Connect Zoom"**
```javascript
// Redirect to Zoom OAuth page
window.location.href = "https://zoom.us/oauth/authorize?...";
```

**2. User approves on Zoom's website**

**3. Zoom redirects back with code**
```
http://localhost:5000/integrations/zoom/callback?code=ABC123
```

**4. Backend exchanges code for tokens**
```javascript
const response = await axios.post("https://zoom.us/oauth/token", {
    code: "ABC123",
    grant_type: "authorization_code"
});

const { access_token, refresh_token } = response.data;
```

**5. Save tokens to user's database record**
```javascript
user.zoomAccessToken = access_token;
user.zoomRefreshToken = refresh_token;
user.zoomConnected = true;
await user.save();
```

**6. Now we can create Zoom meetings on their behalf!**
```javascript
await axios.post("https://api.zoom.us/v2/users/me/meetings", meetingData, {
    headers: { Authorization: `Bearer ${access_token}` }
});
```

---

## 🎓 Learning Path - What to Study Next

### Week 1: JavaScript Basics
- Async/await (handling promises)
- Arrow functions
- Destructuring `const { title, startTime } = req.body`
- Array methods (map, filter, find)

### Week 2: Node.js & Express
- What is Node.js?
- Express basics (routes, middleware)
- HTTP status codes (200, 404, 500, etc.)
- RESTful API design

### Week 3: MongoDB & Mongoose
- What is NoSQL?
- CRUD operations (Create, Read, Update, Delete)
- Mongoose schemas and models
- Querying data

### Week 4: React Basics
- Components and props
- State and useState
- useEffect for side effects
- Event handling

### Week 5: React Advanced
- Context API (sharing data)
- Forms and controlled inputs
- API calls with axios
- Conditional rendering

### Week 6: Authentication
- JWT tokens
- Password hashing (bcrypt)
- Protected routes
- Middleware

### Week 7: External APIs
- OAuth 2.0 flow
- API tokens and refresh tokens
- Making API calls
- Error handling

---

## 🚀 Quick Start Commands

### Starting the Project:

**Terminal 1 - Backend:**
```bash
cd backend
npm install          # Install dependencies (first time only)
npm start           # Start server on http://localhost:5000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm install          # Install dependencies (first time only)
npm run dev         # Start on http://localhost:5173
```

### Environment Variables:
Create `.env` file in backend folder:
```env
MONGO_URI=mongodb://localhost:27017/meetops
JWT_SECRET=your_secret_key
ZOOM_CLIENT_ID=your_zoom_id
ZOOM_CLIENT_SECRET=your_zoom_secret
GOOGLE_CLIENT_ID=your_google_id
GOOGLE_CLIENT_SECRET=your_google_secret
```

---

## 💡 Common Patterns You'll See

### 1. Try-Catch for Error Handling
```javascript
exports.someFunction = async (req, res) => {
  try {
    // Your code that might fail
    const result = await someAsyncOperation();
    return res.json(result);
  } catch (err) {
    // If error happens, catch it
    return res.status(500).json({ error: err.message });
  }
};
```

### 2. Async/Await for Database Operations
```javascript
// ❌ Old way (callback hell):
Meeting.findOne({ _id: id }, function(err, meeting) {
    if (err) { /* handle error */ }
    // use meeting
});

// ✅ New way (async/await):
const meeting = await Meeting.findOne({ _id: id });
```

### 3. Destructuring from Request
```javascript
// ❌ Verbose:
const title = req.body.title;
const startTime = req.body.startTime;
const endTime = req.body.endTime;

// ✅ Clean:
const { title, startTime, endTime } = req.body;
```

### 4. Middleware Chain
```javascript
router.post("/meetings", auth, validateMeeting, createMeeting);
// Runs in order: auth → validateMeeting → createMeeting
```

---

## 🐛 Debugging Tips

### Backend Debugging:
```javascript
// Add console.logs everywhere!
console.log("📥 Received data:", req.body);
console.log("👤 User:", req.user);
console.log("✅ Meeting created:", meeting);
```

### Frontend Debugging:
```javascript
// Use console.log and browser DevTools
console.log("Sending data:", meetingData);
console.log("Response:", response);

// Check Network tab in browser DevTools to see API calls
```

### Common Errors:
- **404 Not Found**: Wrong URL or route not defined
- **401 Unauthorized**: Missing or invalid JWT token
- **500 Internal Server Error**: Something crashed in backend (check logs)
- **CORS Error**: Backend not allowing frontend to connect

---

## 📖 Next Steps to Master This Project

1. **Read each file slowly** - Start with routes, then controllers
2. **Add console.logs everywhere** - See what data flows through
3. **Break something intentionally** - Learn by breaking and fixing
4. **Try adding small features** - Start with simple ones
5. **Draw diagrams** - Visualize the flow with pen and paper
6. **Ask "why?"** - Why is this code here? What if I remove it?

---

## 🎯 Practice Exercises

### Easy:
1. Add a "meeting description" field to the form
2. Change button colors in the UI
3. Add console.logs to trace a request flow

### Medium:
1. Add "Cancel Meeting" feature
2. Show meeting count on dashboard
3. Add search/filter in My Meetings page

### Hard:
1. Add recurring meetings support
2. Implement meeting reminders (email 1 hour before)
3. Add Microsoft Teams integration

---

**Remember**: Every expert was once a beginner. Take it slow, experiment, break things, and learn! 🚀

You've got this! 💪
