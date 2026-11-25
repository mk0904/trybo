import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import MobileShell from './components/MobileShell';
import AuthPage from './pages/AuthPage';
import StorePage from './pages/StorePage';
import CustomerOrderPage from './pages/CustomerOrderPage';
import RiderDashboardPage from './pages/RiderDashboardPage';

function ProtectedRoute({ children, allowedRole }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-sm text-neutral-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRole && user.role !== allowedRole) {
    return <Navigate to={user.role === 'RIDER' ? '/rider' : '/store'} replace />;
  }
  return children;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'RIDER' ? '/rider' : '/store'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <MobileShell>
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/login" element={<AuthPage />} />
            <Route
              path="/store"
              element={
                <ProtectedRoute allowedRole="CUSTOMER">
                  <StorePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders/:id"
              element={
                <ProtectedRoute allowedRole="CUSTOMER">
                  <CustomerOrderPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/rider"
              element={
                <ProtectedRoute allowedRole="RIDER">
                  <RiderDashboardPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MobileShell>
      </BrowserRouter>
    </AuthProvider>
  );
}
