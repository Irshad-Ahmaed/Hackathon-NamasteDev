import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

export function Hero({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <section className="pt-32 pb-20 md:pt-48 md:pb-32 px-6">
      <div className="max-w-5xl mx-auto text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary text-sm font-medium mb-4 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <Sparkles className="w-4 h-4" />
          <span>Aligned with NCERT 2024 Curriculum</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight leading-[1.1] animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-150">
          Your Personal AI <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">
            Study Companion
          </span>
        </h1>
        
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
          Master CBSE Class 10 Mathematics and Science with a smart tutor that explains concepts, solves problems, and generates custom study notes instantly.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-500">
          <Link 
            href={isSignedIn ? "/chat" : "/sign-up"}
            className="group relative inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-semibold text-primary-foreground bg-primary rounded-full overflow-hidden transition-transform hover:scale-105 active:scale-95 shadow-[0_0_40px_rgba(var(--color-primary),0.4)] w-full sm:w-auto"
          >
            <span className="relative z-10 flex items-center gap-2">
              Start Learning Now
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
            <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[100%] group-hover:animate-[shimmer_1.5s_infinite]" />
          </Link>
        </div>
      </div>
    </section>
  );
}
