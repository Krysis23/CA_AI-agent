import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Receipt } from 'lucide-react';
import { FinancialData } from '@/contexts/ChatContext';

interface FinancialSummaryProps {
  data: FinancialData;
  isLoading?: boolean;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const FinancialSummary = ({ data, isLoading }: FinancialSummaryProps) => {
  if (isLoading) {
    return (
      <div className="my-3 p-4 bg-muted/40 border border-border rounded-xl">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-20 bg-muted rounded animate-pulse" />
              <div className="h-6 w-28 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const items = [
    { label: 'Total Credit', value: data.totalCredit, icon: TrendingUp, color: 'text-success', bgColor: 'bg-success/10', borderColor: 'border-success/20' },
    { label: 'Total Debit', value: data.totalDebit, icon: TrendingDown, color: 'text-destructive', bgColor: 'bg-destructive/10', borderColor: 'border-destructive/20' },
    { label: 'Estimated Tax', value: data.estimatedTax, icon: Receipt, color: 'text-primary', bgColor: 'bg-primary/10', borderColor: 'border-primary/20' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3"
    >
      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Financial Summary</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {items.map(({ label, value, icon: Icon, color, bgColor, borderColor }) => (
          <div key={label} className={`${bgColor} border ${borderColor} rounded-xl p-4`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon size={16} className={color} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className={`text-lg font-bold ${color}`}>{formatCurrency(value)}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default FinancialSummary;
