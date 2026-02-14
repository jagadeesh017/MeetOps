import { useState } from "react";
import axios from "axios";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const handleLogin = async () => {
  if (!email || !password) {
    setError("Email and password are required");
    return;
  }

  try {
    setError("");

    const res = await axios.post("http://localhost:5000/auth/login", {
      email,
      password
    });

    localStorage.setItem("token", res.data.token);

    console.log("Logged in:", res.data.user);

    alert("Login successful");

  
  } catch (err) {
    setError(err.response?.data?.message || "Login failed");
  }
};


  return (
 
    <div className="min-h-screen  w-full flex items-center justify-center bg-gray-100 dark:bg-neutral-900 transition-colors">

      <div className="w-full max-w-md bg-white dark:text-white dark:bg-neutral-800 shadow-lg rounded-2xl p-8">

     
        <h2 className="text-2xl font-bold text-blue-600 text-center">MeetOps</h2>
        <p className="text-sm text-gray-500 text-center mb-6">
          Sign in to continue
        </p>

        <div className="mb-4">
          <label className="block text-left text-sm text-gray-600 dark:text-gray-300">Email</label>
          <input
            type="email"
           className="w-full mt-1 border border-gray-300 dark:border-gray-600 
           bg-white dark:bg-neutral-900  rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="mb-4">
          <label className="block text-left text-sm text-gray-600 dark:text-gray-300 ">Password</label>
          <input
            type="password"
            className="w-full mt-1 border border-gray-300 dark:border-gray-600 
           bg-white dark:bg-neutral-900  rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between mb-6 text-sm">
          <label className="flex items-center gap-2 text-grey-400 dark:text-shadow-gray-50">
            <input type="checkbox"  />
            Remember me
          </label>
          <button className="text-blue-600 hover:underline">
            Forgot password?
          </button>
        </div>
        {error && (
        <p className="text-red-500 text-sm mb-3">
            {error}
        </p>
        )}

        <button className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition " onClick={handleLogin}>
          Login
        </button>

      </div>

    </div>
  );
}
