import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ReactNode } from 'react';

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="w-2 h-2 rounded-full gradient-primary animate-typing" />
          <div className="w-2 h-2 rounded-full gradient-primary animate-typing" style={{ animationDelay: '0.2s' }} />
          <div className="w-2 h-2 rounded-full gradient-primary animate-typing" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

export default ProtectedRoute;
