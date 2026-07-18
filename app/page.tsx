import { auth } from '@clerk/nextjs/server';
import { Navbar } from '@/components/landing/Navbar';
import { Hero } from '@/components/landing/Hero';
import { Features } from '@/components/landing/Features';
import { TrustSection } from '@/components/landing/TrustSection';
import { Footer } from '@/components/landing/Footer';

export default async function Home() {
  const { userId } = await auth();
  const isSignedIn = !!userId;

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden selection:bg-primary/30">
      
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 flex justify-center overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[120px] mix-blend-screen opacity-70" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[100px] mix-blend-screen opacity-60" />
      </div>

      <Navbar isSignedIn={isSignedIn} />

      <main className="relative z-10">
        <Hero isSignedIn={isSignedIn} />
        <Features />
        <TrustSection />
      </main>

      <Footer />
    </div>
  );
}
