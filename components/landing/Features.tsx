import { Bot, FileText, Sparkles } from 'lucide-react';

const features = [
  {
    icon: Bot,
    title: 'NCERT-Grounded Tutor',
    description: 'Answers are grounded in authentic NCERT text with direct citations — no hallucinations. Currently live for CBSE Class 10 Mathematics and Science.',
    colorClass: 'text-primary',
    bgClass: 'bg-primary/20',
  },
  {
    icon: FileText,
    title: 'Learn & Notes, Together',
    description: 'Chat with the tutor and watch your personal, editable revision canvas build itself on a side-by-side split screen. No copy-paste, no extra effort.',
    colorClass: 'text-blue-400',
    bgClass: 'bg-blue-500/20',
  },
  {
    icon: Sparkles,
    title: 'Built to Scale',
    description: <>An MVP today — expanding to <i>any class &amp; subject</i>, an <i>autonomous AI agent</i> (no need to pick subject or mode), and <i>B2B + B2C</i> for schools and students.</>,
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/20',
  }
];

export function Features() {
  return (
    <section className="py-24 bg-card/30 border-y border-white/5 relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">A platform to learn and note-take at once</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">Built on the NCERT syllabus, completely private, and highly interactive — starting with CBSE Class 10.</p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, i) => (
            <div key={i} className="group p-8 rounded-3xl bg-secondary/30 border border-white/5 hover:border-primary/30 hover:bg-secondary/50 transition-all duration-300 hover:-translate-y-1">
              <div className={`w-14 h-14 rounded-2xl ${feature.bgClass} ${feature.colorClass} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                <feature.icon className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-foreground">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
