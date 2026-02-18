import { useContext, useState } from "react";
import { AuthContext } from "./context/Authcontext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import MyMeetings from "./pages/MyMeetings";

function App() {
  const { user, loading } = useContext(AuthContext);
  const [currentView, setCurrentView] = useState("dashboard");

  if (loading) return <p>Loading...</p>;

  if (!user) return <Login />;

  // Render based on current view
  if (currentView === "myMeetings") {
    return <MyMeetings onBack={() => setCurrentView("dashboard")} />;
  }

  return <Dashboard onNavigateToMeetings={() => setCurrentView("myMeetings")} />;
}

export default App;

