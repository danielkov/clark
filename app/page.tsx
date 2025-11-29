import Link from 'next/link';
import { getSignUpUrl, getSignInUrl, withAuth } from '@workos-inc/authkit-nextjs';
import { Button } from '@/components/ui/button';

export default async function HomePage() {
  // Retrieves the user from the session or returns `null` if no user is signed in
  const { user } = await withAuth();

  // Get the URL to redirect the user to AuthKit to sign up
  const signUpUrl = await getSignUpUrl();
  const signInUrl = await getSignInUrl();

  if (!user) {
    return (
      <>
        <Button variant="link" asChild><Link href={signInUrl}>Sign in</Link></Button>
        <Button asChild><Link href={signUpUrl}>Sign up</Link></Button>
      </>
    );
  }

  return (
    <>
      <p>Welcome back{user.firstName && `, ${user.firstName}`}</p>
      <Button asChild><Link href="/dashboard">Dashboard</Link></Button>
    </>
  );
}