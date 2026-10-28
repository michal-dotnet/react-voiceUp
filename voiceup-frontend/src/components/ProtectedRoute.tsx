import { Navigate, Outlet } from "react-router";
import useAuth from "../hooks/useAuth";

const ProtectedRoute   = ({ requiredRole }: {requiredRole?: "ADMIN";}) => {
  
  const { isAuthenticated ,user} = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (requiredRole && user?.role !== requiredRole) {
  return <Navigate to="/" replace />;
}

  return <Outlet />;
};

export default ProtectedRoute;