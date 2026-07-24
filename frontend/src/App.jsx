import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import axios from "axios";
import LoginPage from "./components/LoginPage";
import AdminDashboard from "./pages/AdminDashboard";
import CajeroDashboard from "./pages/CajeroDashboard";
import { getCurrentUser, getToken, logout } from "./api/auth";
import { CustomDialogProvider } from "./components/common/CustomDialog";

// Global Request Interceptor
axios.interceptors.request.use((config) => {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";
  const NEW_API_URL = import.meta.env.VITE_NEW_API_URL || "http://localhost:8000/api/v1";
  
  if ((config.url?.startsWith(API_URL) || config.url?.startsWith(NEW_API_URL)) && !config.url?.endsWith("/token")) {
    const token = getToken();
    if (!token) {
      return Promise.reject(new Error("Token expired"));
    }
  }
  return config;
});

// Global Response Interceptor
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.message === "Token expired") {
      logout();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

function App() {
  const [user, setUser] = useState(() => getCurrentUser() || null);

  return (
    <CustomDialogProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={setUser} />} />

          <Route path="/admin" element={
            user?.role?.toLowerCase() === "administrador" || user?.role?.toLowerCase() === "admin"
              ? <AdminDashboard user={user} />
              : <Navigate to="/login" />
          } />

          <Route path="/caja" element={
            user?.role?.toLowerCase() === "cajero"
              ? <CajeroDashboard user={user} />
              : <Navigate to="/login" />
          } />

          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </BrowserRouter>
    </CustomDialogProvider>
  );
}

export default App;
