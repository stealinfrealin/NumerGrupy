import { Routes, Route, Navigate } from "react-router-dom";
import AuthForm from "./componentAuthForm";
import Dashboard from "./pagesDashboard";
import AdminDashboard from "./pagesAdminDashboard";
import ProtectedRoute from "./componentProtectedRoute";

function App() {
    return (
        <Routes>
            <Route path="/login" element={<AuthForm key="login" />} />
            <Route path="/register" element={<AuthForm key="register" />} />
            <Route path="/admin/login" element={<AuthForm key="admin-login" role="admin" />} />

            <Route path="/dashboard" element={
                <ProtectedRoute requiredRole="patient">
                    <Dashboard />
                </ProtectedRoute>
            } />
            <Route path="/admin/dashboard" element={
                <ProtectedRoute requiredRole="admin">
                    <AdminDashboard />
                </ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
    );
}

export default App;
