import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLElement> {
  variant?: 'default' | 'brand';
}

const variantStyles = {
  default: 'border-slate-200 bg-white text-slate-950',
  brand: 'border-teal-900 bg-teal-950 text-white',
} as const;

export function Card({
  className = '',
  variant = 'default',
  ...props
}: CardProps): React.JSX.Element {
  return (
    <section
      className={`rounded-xl border shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${variantStyles[variant]} ${className}`}
      {...props}
    />
  );
}
