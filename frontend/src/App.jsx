
import './App.css'
import Login from './pages/Login'
import { useContext } from "react";
import { AuthContext } from "./context/Authcontext";
function App() {
  
  const { user, loading } = useContext(AuthContext);

  if (loading) return <p>Loading...</p>;

  return user ? <h1>Dashboard (Logged In)</h1> : <Login />;
}

export default App
