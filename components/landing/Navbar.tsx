import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';

export function Navbar({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <nav className="fixed top-4 left-1/2 -translate-x-1/2 w-[90%] md:w-[80%] z-50 rounded-full border border-white/10 bg-background/60 backdrop-blur-md shadow-2xl">
      <div className="w-full px-6 md:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
          <span className="text-primary">✦</span> StudyNotes+
        </div>
        <div className="flex items-center gap-4">
          {isSignedIn ? (
            <div className="flex items-center gap-4">
              <Link
                href="/chat"
                className="px-4 py-2 rounded-full bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(var(--color-primary),0.3)]"
              >
                Go to App
              </Link>
              <UserButton />
            </div>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="px-4 py-2 rounded-full text-sm font-medium hover:text-primary transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up"
                className="px-4 py-2 rounded-full bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(var(--color-primary),0.3)]"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
