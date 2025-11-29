# API Routes to Server Actions Migration

## Overview
Migrated from Next.js API routes to server actions for internal data fetching and mutations, keeping API routes only for OAuth callbacks and webhooks that require stable URLs.

## Changes Made

### Kept as API Routes (Stable URLs Required)
These routes need to remain as API routes because they're called by third-party services:

- `/api/auth/login` - WorkOS authentication redirect
- `/api/auth/callback` - WorkOS OAuth callback handler
- `/api/linear/authorize` - Linear OAuth authorization redirect
- `/api/linear/callback` - Linear OAuth callback handler

### Converted to Server Actions

#### Created New Server Action Files

1. **`lib/linear/actions.ts`** - Linear integration actions
   - `getLinearConnectionStatus()` - Check if user has Linear connected
   - `disconnectLinear()` - Disconnect Linear integration

2. **`lib/linear/initiatives-actions.ts`** - Initiative management actions
   - `getInitiatives()` - Fetch all initiatives
   - `createNewInitiative(name, description)` - Create new initiative
   - `setInitiativeAsATSContainer(initiativeId)` - Set ATS container
   - `completeInitiativeSetup(initiativeId)` - Complete setup with tone of voice doc

#### Removed API Routes
- ❌ `/api/initiatives` (GET/POST)
- ❌ `/api/initiatives/set-container` (POST)
- ❌ `/api/initiatives/complete-setup` (POST)
- ❌ `/api/linear/disconnect` (POST)
- ❌ `/api/linear/status` (GET)

#### Updated Components
- **`components/initiative-selector.tsx`** - Now uses server actions instead of fetch calls

## Benefits

1. **Better Performance** - Server actions eliminate unnecessary network roundtrips
2. **Type Safety** - Direct function calls with TypeScript types
3. **Simpler Code** - No need for JSON serialization/deserialization
4. **Proper Architecture** - API routes only for external integrations
5. **Better DX** - Easier to test and maintain

## Migration Pattern

### Before (API Route)
```typescript
// API Route
export async function GET() {
  const { user } = await withAuth();
  const data = await fetchData();
  return NextResponse.json({ data });
}

// Client Component
const response = await fetch('/api/endpoint');
const { data } = await response.json();
```

### After (Server Action)
```typescript
// Server Action
'use server';
export async function getData() {
  const { user } = await withAuth();
  return await fetchData();
}

// Client Component
import { getData } from '@/lib/actions';
const data = await getData();
```

## Testing
All functionality remains the same - only the implementation changed. Test the onboarding flow to ensure initiative selection and creation still works correctly.
