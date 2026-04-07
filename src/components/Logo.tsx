import { Brain } from 'lucide-react';

const Logo = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const sizes = {
    sm: { icon: 18, text: 'text-base' },
    md: { icon: 24, text: 'text-xl' },
    lg: { icon: 36, text: 'text-3xl' },
  };
  const s = sizes[size];

  return (
    <div className="flex items-center gap-2">
      <div className="gradient-primary rounded-lg p-1.5 glow-primary">
        <Brain size={s.icon} className="text-primary-foreground" />
      </div>
      <span className={`font-bold tracking-tight ${s.text}`}>
        <span className="gradient-text">CA_AI</span>
        <span className="text-muted-foreground font-medium ml-1">Agent</span>
      </span>
    </div>
  );
};

export default Logo;
