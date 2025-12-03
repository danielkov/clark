# Task 19 Implementation Notes

## Overview

This task implements usage limit error handling in the UI for both job description generation and candidate screening features. When users reach their usage limits, they see clear error messages and an immediate upgrade prompt.

## Changes Made

### 1. Application Form Component (`components/application-form.tsx`)

**Changes:**
- Added imports for `UpgradePrompt` and `createCheckoutAction`
- Added state variables:
  - `showUsageLimitError`: Controls display of upgrade prompt
  - `isUpgrading`: Tracks upgrade process state
- Added pre-submission balance check in the application action
- Modified error handling to detect usage limit errors
- Added `handleUpgrade` function to initiate checkout flow
- Integrated `UpgradePrompt` component display when limits are reached

**Error Detection:**
The component detects usage limit errors by checking if error messages contain keywords like "candidate screening limit" or "reached your candidate screening limit".

**User Experience:**
1. User fills out application form
2. On submit, system checks candidate screening balance
3. If insufficient balance:
   - Form displays `UpgradePrompt` component
   - Clear error message explains the limit
   - User can click upgrade button to go to checkout
4. If sufficient balance:
   - Application proceeds normally

### 2. Job Description Generator Component (`components/job-description-generator.tsx`)

**New Component:**
Created a reusable component for job description generation with built-in error handling.

**Features:**
- Accepts `onGenerate` callback for flexibility
- Displays loading states during generation
- Catches and handles `InsufficientBalanceError`
- Shows `UpgradePrompt` when limits are reached
- Displays generated content on success
- Provides immediate upgrade button

**Props:**
```typescript
interface JobDescriptionGeneratorProps {
  onGenerate: (originalText: string, toneOfVoice: string) => Promise<string | undefined>;
  originalText?: string;
  toneOfVoice?: string;
  onSuccess?: (enhancedDescription: string) => void;
  currentTier?: string;
}
```

**Usage:**
See `components/job-description-generator-example.tsx` for integration example.

### 3. Application Action (`lib/actions/application.ts`)

**Changes:**
- Added import for `checkMeterBalance`
- Added pre-submission balance check for candidate screening
- Returns clear error message when balance is insufficient
- Logs warnings for insufficient balance
- Gracefully handles meter check failures (doesn't block applications)

**Balance Check Logic:**
```typescript
const balanceCheck = await checkMeterBalance(linearOrg, 'candidate_screenings');

if (!balanceCheck.allowed && !balanceCheck.unlimited) {
  return {
    success: false,
    errors: [{
      field: 'submit',
      message: `You have reached your candidate screening limit...`
    }]
  };
}
```

### 4. Example Component (`components/job-description-generator-example.tsx`)

**Purpose:**
Demonstrates how to integrate the `JobDescriptionGenerator` component into a page or form.

**Documentation:**
Includes detailed comments explaining:
- How to import required dependencies
- How to get Linear organization ID
- How to create wrapper functions
- How to handle success callbacks

## Requirements Satisfied

### Requirement 8.2: Block operations when meter exhausted
✅ Both components check balance and block operations when limits are reached

### Requirement 8.3: Display clear error messages
✅ Error messages explain:
- Which limit was reached
- Current balance vs. limit
- Need to upgrade subscription

### Requirement 8.4: Provide immediate upgrade button
✅ `UpgradePrompt` component includes:
- Recommended tier information
- Pricing details
- Immediate upgrade button
- Redirect to Polar checkout

## Error Flow

### Job Description Generation:
1. User initiates generation
2. `enhanceJobDescription` checks balance
3. If insufficient → throws `InsufficientBalanceError`
4. Component catches error
5. Displays `UpgradePrompt` with job_descriptions meter
6. User clicks upgrade → redirects to checkout

### Candidate Screening:
1. User submits application
2. `submitApplication` checks balance
3. If insufficient → returns error in response
4. Form detects error keywords
5. Displays `UpgradePrompt` with candidate_screenings meter
6. User clicks upgrade → redirects to checkout

## Integration Points

### For Job Description Generation:
Any page that needs job description generation should:
1. Import `JobDescriptionGenerator` component
2. Create wrapper function calling `enhanceJobDescription`
3. Pass Linear org ID and current tier
4. Handle success callback

### For Candidate Screening:
The `ApplicationForm` component is already integrated and ready to use.

## Testing Considerations

To test the error handling:
1. Set up a test organization with Free tier (10 job descriptions, 50 screenings)
2. Exhaust the meter balance
3. Attempt to generate job description or submit application
4. Verify `UpgradePrompt` displays correctly
5. Verify upgrade button redirects to checkout
6. Verify error messages are clear and helpful

## Future Enhancements

Potential improvements:
1. Add real-time balance display before operations
2. Show warning when approaching limits (e.g., 80% used)
3. Add ability to dismiss upgrade prompt and try again later
4. Cache balance checks to reduce API calls
5. Add analytics tracking for upgrade prompt interactions
