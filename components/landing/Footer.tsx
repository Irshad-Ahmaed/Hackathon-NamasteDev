export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-background py-12 relative z-10">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2 font-bold text-lg opacity-80">
          <span className="text-primary">✦</span> CBSE Tutor
        </div>
        <div className="text-sm text-muted-foreground text-center md:text-left">
          Built for the AI Hackathon. Demo Prototype.
        </div>
      </div>
    </footer>
  );
}
