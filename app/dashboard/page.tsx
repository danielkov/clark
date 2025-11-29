import { Button } from "@/components/ui/button";
import { signOut, withAuth } from "@workos-inc/authkit-nextjs";
import Link from "next/link";

export default async function DashboardPage() {
    const { user } = await withAuth({ ensureSignedIn: true });

    return <div><p>Welcome {user.firstName}!</p><form action={async function signout() {
        "use server";
        await signOut();
    }}><Button type="submit">Sign out</Button></form></div>
}