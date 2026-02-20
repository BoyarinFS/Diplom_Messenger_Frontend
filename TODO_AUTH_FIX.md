# Authentication Improvements - TODO

## Tasks 1.1 - 1.3 (Branch: fix/register)

### 1.1 Password Complexity Regex ✅
- [x] Add password validation function with 5 requirements:
  - Min 8 characters
  - At least 1 uppercase letter
  - At least 1 lowercase letter
  - At least 1 digit
  - At least 1 special character (!@#$%^&*)
- [x] Add real-time password strength indicator (progress bar)
- [x] Show requirements list with ✓/✗ checkmarks
- [x] Block form submission if password is weak

### 1.2 Confirm Password Field ✅
- [x] Add confirmPassword field to registerData state
- [x] Add Confirm Password input field to form
- [x] Validate password === confirmPassword in real-time
- [x] Show error message if passwords don't match
- [x] Block form submission if passwords don't match


### 1.3 Fix Resend Verification Endpoint ✅
- [x] Verify resendVerificationCode passes email correctly
- [x] Check API endpoint format matches backend expectations
- [x] Ensure email from account is used for resend


### Files to Modify:
1. `src/features/auth/components/auth-form.tsx` - Main changes
2. `src/features/auth/providers/auth-context.tsx` - Confirm password validation
3. `src/shared/types/types.ts` - Add confirmPassword to types (optional)

### Skip:
- 1.4 Clean unverified accounts (backend task)
