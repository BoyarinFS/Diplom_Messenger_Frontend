'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Loader2, RefreshCw, Mail, AlertCircle, CheckCircle2 } from 'lucide-react';

interface EmailVerificationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  maxAttempts?: number;
}

export function EmailVerificationDialog({
  isOpen,
  onClose,
  email,
  onVerify,
  onResend,
  maxAttempts = 3,
}: EmailVerificationDialogProps) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(maxAttempts);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Таймер для повторной отправки
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer((t) => t - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  // Фокус на первый инпут при открытии
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [isOpen]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Только цифры

    const newCode = [...code];
    newCode[index] = value.slice(-1); // Берем только последнюю цифру
    setCode(newCode);
    setError('');

    // Автофокус на следующий инпут
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Автопроверка когда все заполнено
    const fullCode = newCode.join('');
    if (fullCode.length === 6 && newCode.every((c) => c !== '')) {
      handleVerify(fullCode);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      // Переход на предыдущий при backspace
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const newCode = pasted.split('');
      setCode(newCode);
      inputRefs.current[5]?.focus();
      handleVerify(pasted);
    }
  };

  const handleVerify = async (fullCode: string) => {
    if (isLoading || attemptsLeft <= 0) return;

    setIsLoading(true);
    setError('');

    try {
      await onVerify(fullCode);
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setCode(['', '', '', '', '', '']);
      }, 1500);
    } catch (err: any) {
      setAttemptsLeft((a) => a - 1);
      setError(err.message || 'Invalid code. Please try again.');
      // Очистка полей при ошибке
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (isResending || resendTimer > 0) return;

    setIsResending(true);
    setError('');

    try {
      await onResend();
      setResendTimer(60); // 60 секунд таймер
      setAttemptsLeft(maxAttempts); // Сброс попыток
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = code.join('');
    if (fullCode.length === 6) {
      handleVerify(fullCode);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <DialogContent className="sm:max-w-md" showCloseButton={!isLoading}>
        <DialogHeader className="space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">
            Verify Your Email
          </DialogTitle>
          <DialogDescription className="text-center">
            We sent a 6-digit code to{' '}
            <span className="font-medium text-foreground">{email}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* Поля для ввода кода */}
          <div className="space-y-2">
            <Label htmlFor="code-0" className="text-center block text-sm">
              Enter verification code
            </Label>
            <div className="flex justify-center gap-2">
              {code.map((digit, index) => (
                <Input
                  key={index}
                  id={`code-${index}`}
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={index === 0 ? handlePaste : undefined}
                  disabled={isLoading || success}
                  className="w-12 h-12 text-center text-lg font-semibold"
                />
              ))}
            </div>
          </div>

          {/* Счетчик попыток */}
          <div className="text-center text-sm">
            <span className="text-muted-foreground">Attempts left: </span>
            <span
              className={`font-medium ${
                attemptsLeft <= 1 ? 'text-destructive' : 'text-foreground'
              }`}
            >
              {attemptsLeft}
            </span>
          </div>

          {/* Ошибка */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Успех */}
          {success && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-md">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Email verified successfully!</span>
            </div>
          )}

          {/* Кнопки */}
          <div className="space-y-3">
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || success || code.some((c) => !c)}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : success ? (
                'Verified!'
              ) : (
                'Verify Email'
              )}
            </Button>

            <div className="text-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResend}
                disabled={isResending || resendTimer > 0 || isLoading || success}
                className="text-muted-foreground hover:text-foreground"
              >
                {isResending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : resendTimer > 0 ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Resend in {resendTimer}s
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Resend Code
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
