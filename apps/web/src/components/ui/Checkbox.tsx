import React, { forwardRef } from 'react';
import { Check } from 'lucide-react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  description?: string;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, error, id, className = '', disabled, checked, ...props }, ref) => {
    const generatedId = React.useId();
    const checkboxId = id || generatedId;

    return (
      <div className={`flex items-start gap-2.5 ${className}`}>
        <label
          htmlFor={checkboxId}
          className={`relative flex items-center h-5 mt-0.5 ${
            disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          <input
            ref={ref}
            id={checkboxId}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            className="peer sr-only"
            {...props}
          />
          <div
            aria-hidden="true"
            className={`w-4 h-4 border transition-colors flex items-center justify-center pointer-events-none select-none peer-focus-visible:ring-2 peer-focus-visible:ring-enp-blue-primary peer-focus-visible:ring-offset-2 ${
              checked
                ? 'bg-enp-blue-primary border-enp-blue-primary text-white'
                : 'bg-white border-enp-border hover:border-enp-blue-primary'
            } ${disabled ? 'opacity-50 cursor-not-allowed bg-enp-bg' : ''} ${
              error ? 'border-enp-red-error' : ''
            }`}
          >
            {checked && <Check className="w-3.5 h-3.5 stroke-[3]" aria-hidden="true" />}
          </div>
        </label>
        {(label || description) && (
          <div className="text-sm select-none">
            {label && (
              <label
                htmlFor={checkboxId}
                className={`font-medium text-enp-black ${
                  disabled ? 'cursor-not-allowed' : 'cursor-pointer'
                } ${
                  disabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {label}
              </label>
            )}
            {description && <p className="text-xs text-enp-gray-medium mt-0.5">{description}</p>}
            {error && <p className="text-xs text-enp-red-error mt-0.5">{error}</p>}
          </div>
        )}
      </div>
    );
  },
);

Checkbox.displayName = 'Checkbox';
