import { useState } from 'react';
import ChatSidebar from '@/components/ChatSidebar';
import ChatArea from '@/components/ChatArea';
import { ChatProvider } from '@/contexts/ChatContext';

const Dashboard = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <ChatProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        <ChatSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
        <ChatArea />
      </div>
    </ChatProvider>
  );
};

export default Dashboard;
