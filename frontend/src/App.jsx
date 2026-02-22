import { useContext } from "react";
import { AuthContext } from "./context/Authcontext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

function App() {
  const { user, loading } = useContext(AuthContext);

  if (loading) return <p>Loading...</p>;

  if (!user) return <Login />;

  return <Dashboard />;
}

export default App;

