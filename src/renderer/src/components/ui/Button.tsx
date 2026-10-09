import type { ButtonHTMLAttributes } from 'react';
import { buttonStyles } from './buttonStyles';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonProps): React.JSX.Element {
  return <button type={type} className={buttonStyles({ variant, size, className })} {...props} />;
}
