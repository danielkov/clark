import { getSignUpUrl, getSignInUrl, withAuth } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';
import { Navbar1 } from '@/components/navbar1';
import { Hero7 } from '@/components/hero7';
import { Footer2 } from '@/components/footer2';
import { Testimonial10 } from '@/components/testimonial10';
import { Feature73 } from '@/components/feature73';
import { Integration3 } from '@/components/integration3';
import { Cta10 } from '@/components/cta10';
import { Pricing4 } from '@/components/pricing4';
import { getPricingTiers } from '@/lib/actions/products';

export default async function HomePage() {
  // Retrieves the user from the session or returns `null` if no user is signed in
  const { user } = await withAuth();

  if (user) {
    redirect("/dashboard");
  }

  // Get the URL to redirect the user to AuthKit to sign up
  const signUpUrl = await getSignUpUrl();
  const signInUrl = await getSignInUrl();
  
  // Fetch pricing from Polar
  const pricingTiers = await getPricingTiers();

  return (
    <main className='flex flex-col items-center px-6 md:px-0'>
      <Navbar1 auth={
      {
        login: {
          title: "Sign in",
          url: signInUrl,
        },
        signup: {
          title: "Sign up",
          url: signUpUrl,
        }
      }} />
      <Hero7
        heading={'The hiring platform that lives where your team already works'}
        description={'Evolve Linear into a seamless recruiting hub. From instant job descriptions to candidate management, every step becomes faster, smarter, and beautifully simple.'}
        button={{
          text: 'Start hiring now',
          url: signUpUrl,
        }}
        reviews={{
          count: 3,
          rating: 5,
          avatars: [
            {
              src: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar-1.webp",
              alt: "Avatar 1",
            },
            {
              src: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar-2.webp",
              alt: "Avatar 2",
            },
            {
              src: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar-3.webp",
              alt: "Avatar 3",
            },
            
          ],
        }}
      />
      <Testimonial10 
        quote="This would've been cool to have when we were hiring for Tandem. Could've saved us a bunch of time." 
        author={{
          name: "Jack Roalfe", 
          role: "CEO, Tandem Dating", 
          avatar: { 
            src: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar-1.webp", 
            alt: "Picture of Jack Roalfe, CEO of Tandem Dating" 
          } 
        }} 
      />
      <div id="features">
        <Feature73 
          buttonText='Get started'
          buttonUrl={signUpUrl}
          title="Features you'll love" 
          description="Everything you need to hire faster and smarter, powered by AI and built for teams that use Linear."
        />
      </div>
      <Cta10 
        buttons={{
          primary: {
            text: "Get Started Free",
            url: signUpUrl,
          },
          secondary: {
            text: "View Pricing",
            url: "#pricing",
          },
        }}
      />
      <div id="pricing">
        <Pricing4 pricingTiers={pricingTiers} />
      </div>
      <div id="integrations">
        <Integration3 />
      </div>
      <Footer2 />
    </main>
  );
}