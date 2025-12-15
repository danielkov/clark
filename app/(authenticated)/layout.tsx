import { AuthKitProvider } from '@workos-inc/authkit-nextjs/components';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthKitProvider>{children}</AuthKitProvider>;
}
