'use client';

import type React from 'react';

import { useState } from 'react';
import { useAuth } from '@/features/auth';
import { EmailVerificationDialog } from './email-verification-dialog';
import { Button } from '@/shared/ui/button';
import { Chrome, Check, X, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';

import { Input } from '@/shared/ui/input';

import { Label } from '@/shared/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';


export function AuthForm() {
  const { 
    login, 
    register, 
    showVerificationDialog, 
    verificationEmail, 
    verifyEmail, 
    resendVerificationCode,
    closeVerificationDialog 
  } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');


  const [loginData, setLoginData] = useState({
    login: '',
    password: '',
  });

  const [registerData, setRegisterData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    firstname: '',
    lastname: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);



  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(loginData.login, loginData.password);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Password validation requirements
  // Обязательные: длина (8 символов) и цифра
  const mandatoryRequirements = [
    { id: 'length', label: 'Минимум 8 символов *', test: (pwd: string) => pwd.length >= 8 },
    { id: 'digit', label: 'Одна цифра *', test: (pwd: string) => /[0-9]/.test(pwd) },
    { id: 'lowercase', label: 'Одна строчная буква', test: (pwd: string) => /[a-z]/.test(pwd) },
  ];

  // Опциональные: заглавная, строчная, спецсимвол
  const optionalRequirements = [
    { id: 'uppercase', label: 'Одна заглавная буква', test: (pwd: string) => /[A-Z]/.test(pwd) },
    { id: 'special', label: 'Один спецсимвол (!@#$%^&*)', test: (pwd: string) => /[!@#$%^&*]/.test(pwd) },
  ];

  const allRequirements = [...mandatoryRequirements, ...optionalRequirements];

  const getPasswordStrength = (password: string) => {
    const passedMandatory = mandatoryRequirements.filter(req => req.test(password)).length;
    const passedOptional = optionalRequirements.filter(req => req.test(password)).length;
    const totalPassed = passedMandatory + passedOptional;
    
    // Валидно только если все обязательные требования выполнены
    const isValid = passedMandatory === mandatoryRequirements.length;
    
    return {
      score: totalPassed,
      isValid,
      label: isValid ? (totalPassed === 5 ? 'Надёжный' : 'Средний') : 'Слабый',
      color: isValid ? (totalPassed === 5 ? 'bg-green-500' : 'bg-yellow-500') : 'bg-red-500',
    };
  };



  const passwordStrength = getPasswordStrength(registerData.password);
  const passwordsMatch = registerData.password === registerData.confirmPassword && registerData.confirmPassword !== '';
  const canSubmit = passwordStrength.isValid && passwordsMatch && registerData.username && registerData.email && registerData.firstname && registerData.lastname;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError('');

    if (!passwordStrength.isValid) {
      setError('Пароль должен содержать минимум 8 символов и хотя бы одну цифру.');
      return;
    }

    if (!passwordsMatch) {
      setError('Пароли не совпадают');
      return;
    }

    setIsLoading(true);

    try {
      const { confirmPassword, ...registerPayload } = registerData;
      await register(registerPayload);
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err?.message || 'Ошибка при регистрации. Попробуйте снова.');
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Yoptagramm
          </CardTitle>
          <CardDescription className="text-center">
            Connect with friends and chat instantly
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-username">Username</Label>
                  <Input
                    id="login-username"
                    placeholder="Enter your username"
                    value={loginData.login}
                    onChange={(e) =>
                      setLoginData({ ...loginData, login: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="Enter your password"
                    value={loginData.password}
                    onChange={(e) =>
                      setLoginData({ ...loginData, password: e.target.value })
                    }
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Logging in...' : 'Login'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstname">First Name</Label>
                    <Input
                      id="firstname"
                      placeholder="John"
                      value={registerData.firstname}
                      onChange={(e) =>
                        setRegisterData({
                          ...registerData,
                          firstname: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastname">Last Name</Label>
                    <Input
                      id="lastname"
                      placeholder="Doe"
                      value={registerData.lastname}
                      onChange={(e) =>
                        setRegisterData({
                          ...registerData,
                          lastname: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-username">Username</Label>
                  <Input
                    id="reg-username"
                    placeholder="johndoe"
                    value={registerData.username}
                    onChange={(e) =>
                      setRegisterData({
                        ...registerData,
                        username: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="john@example.com"
                    value={registerData.email}
                    onChange={(e) =>
                      setRegisterData({
                        ...registerData,
                        email: e.target.value,
                      })
                    }
                    required
                  />

                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="reg-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Create a password"
                      value={registerData.password}
                      onChange={(e) =>
                        setRegisterData({
                          ...registerData,
                          password: e.target.value,
                        })
                      }
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  
                  {/* Password Strength Indicator */}
                  {registerData.password && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Сложность:</span>
                        <span className={passwordStrength.isValid ? 'text-green-600' : passwordStrength.score >= 3 ? 'text-yellow-600' : 'text-red-600'}>
                          {passwordStrength.label}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                          style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                        />
                      </div>
                      {/* Accordion for requirements */}
                      <button
                        type="button"
                        onClick={() => setShowRequirements(!showRequirements)}
                        className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                      >
                        <span>Требования к паролю</span>
                        {showRequirements ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      
                      {showRequirements && (
                        <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                          <p className="text-xs font-medium text-foreground">Обязательно:</p>
                          <ul className="space-y-1">
                            {mandatoryRequirements.map((req) => (
                              <li key={req.id} className="flex items-center gap-2 text-xs">
                                {req.test(registerData.password) ? (
                                  <Check className="h-3 w-3 text-green-500" />
                                ) : (
                                  <X className="h-3 w-3 text-red-500" />
                                )}
                                <span className={req.test(registerData.password) ? 'text-green-600' : 'text-red-600'}>
                                  {req.label}
                                </span>
                              </li>
                            ))}
                          </ul>
                          
                          <p className="text-xs font-medium text-muted-foreground mt-2">Рекомендуется:</p>
                          <ul className="space-y-1">
                            {optionalRequirements.map((req) => (
                              <li key={req.id} className="flex items-center gap-2 text-xs">
                                {req.test(registerData.password) ? (
                                  <Check className="h-3 w-3 text-green-500" />
                                ) : (
                                  <X className="h-3 w-3 text-muted-foreground" />
                                )}
                                <span className={req.test(registerData.password) ? 'text-green-600' : 'text-muted-foreground'}>
                                  {req.label}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}


                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reg-confirm-password">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="reg-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm your password"
                      value={registerData.confirmPassword}
                      onChange={(e) =>
                        setRegisterData({
                          ...registerData,
                          confirmPassword: e.target.value,
                        })
                      }
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {registerData.confirmPassword && (
                    <div className="flex items-center gap-2 text-xs">
                      {passwordsMatch ? (
                        <>
                          <Check className="h-3 w-3 text-green-500" />
                          <span className="text-green-600">Пароли совпадают</span>
                        </>
                      ) : (
                        <>
                          <X className="h-3 w-3 text-red-500" />
                          <span className="text-red-600">Пароли не совпадают</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button type="submit" className="w-full" disabled={isLoading || !canSubmit}>
                  {isLoading ? 'Creating account...' : 'Create Account'}
                </Button>

              </form>
            </TabsContent>
          </Tabs>

          {/* Divider */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>

          {/* Google OAuth Button */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              window.location.href = 'http://localhost/back-yoptagramm-service/oauth2/authorization/google';
            }}
          >
            <Chrome className="mr-2 h-4 w-4" />
            Google
          </Button>
        </CardContent>
      </Card>


      <EmailVerificationDialog
        isOpen={showVerificationDialog}
        onClose={closeVerificationDialog}
        email={verificationEmail}
        onVerify={verifyEmail}
        onResend={resendVerificationCode}
      />
    </div>
  );
}
