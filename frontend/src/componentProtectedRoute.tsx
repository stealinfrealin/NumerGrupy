import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

interface ProtectedRouteProps {
    children: JSX.Element;
    requiredRole?: 'patient' | 'admin';
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
    const { isAuthenticated, loading, user } = useAuth();
    const location = useLocation();

    console.log(" ProtectedRoute check:", { isAuthenticated, userRole: user?.role, requiredRole });

    if (loading) {
        return <div>Ładowanie...</div>;
    }


    if (!isAuthenticated) {
        const redirectPath = requiredRole === 'admin' ? '/admin/login' : '/login';
        return <Navigate to={redirectPath} state={{ from: location }} replace />;
    }

    if (requiredRole && user?.role && user.role !== requiredRole) {
        const fallback = user.role === 'admin' ? "/admin/dashboard" : "/dashboard";
        return <Navigate to={fallback} replace />;
    }

    return children;
}
