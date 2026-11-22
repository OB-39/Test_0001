import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

export interface StatCardProps {
  label?: string;
  title?: string;
  value: string | number;
  subtext?: string;
  description?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number | string;
    direction: 'up' | 'down' | 'neutral';
    label?: string;
  };
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
  onClick?: () => void;
}

export function StatCard({
  label,
  title,
  value,
  subtext,
  description,
  icon,
  trend,
  variant = 'default',
  className = '',
  onClick,
}: StatCardProps) {
  const finalLabel = title ?? label ?? '';
  const finalSubtext = description ?? subtext;

  const valueTone = {
    default: 'text-enp-black',
    primary: 'text-enp-blue-deep',
    success: 'text-enp-green-valid',
    warning: 'text-amber-700',
    danger: 'text-enp-red-error',
  };

  const isClickable = Boolean(onClick);

  return (
    <div
      onClick={onClick}
      className={`bg-white border border-enp-border p-3.5 sm:p-4 transition-colors overflow-hidden min-w-0 ${
        isClickable ? 'cursor-pointer hover:bg-enp-blue-ice/30 hover:border-enp-blue-primary/40' : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs font-medium text-enp-gray-medium truncate">
          {finalLabel}
        </span>
        {icon && <div className="text-enp-blue-primary shrink-0">{icon}</div>}
      </div>

      <div className="flex items-baseline gap-2 flex-wrap">
        <span className={`text-xl sm:text-2xl font-bold tracking-tight font-sans tabular-nums break-words ${valueTone[variant]}`}>
          {value}
        </span>
        {trend && (
          <span
            className={`inline-flex items-center text-xs font-semibold tabular-nums ${
              trend.direction === 'up'
                ? 'text-enp-green-valid'
                : trend.direction === 'down'
                ? 'text-enp-red-error'
                : 'text-enp-gray-medium'
            }`}
          >
            {trend.direction === 'up' && <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />}
            {trend.direction === 'down' && <ArrowDownRight className="w-3.5 h-3.5" aria-hidden="true" />}
            {trend.direction === 'neutral' && <Minus className="w-3.5 h-3.5" aria-hidden="true" />}
            {trend.value}
          </span>
        )}
      </div>

      {finalSubtext && <p className="text-[11px] sm:text-xs text-enp-gray-medium mt-0.5 truncate">{finalSubtext}</p>}
    </div>
  );
}
