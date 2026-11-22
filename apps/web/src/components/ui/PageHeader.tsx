import React from 'react';
import { Breadcrumb, BreadcrumbItem } from './Breadcrumb';

export interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  subtitle?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  subtitle,
  breadcrumbs,
  actions,
  badge,
  className = '',
}: PageHeaderProps) {
  const desc = description ?? subtitle;

  return (
    <div className={`mb-4 pb-3 sm:mb-5 sm:pb-4 border-b border-enp-border ${className}`}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="hidden sm:block mb-1.5">
          <Breadcrumb items={breadcrumbs} />
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
        <div className="min-w-0 sm:flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-lg sm:text-2xl font-bold text-enp-blue-deep tracking-tight font-sans text-balance">
              {title}
            </h1>
            {badge && <div className="shrink-0">{badge}</div>}
          </div>
          {desc && (
            <p className="mt-0.5 text-xs sm:text-sm text-enp-gray-medium max-w-2xl leading-snug break-words">
              {desc}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-wrap sm:shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
