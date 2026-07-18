import { Bot, BrainCircuit, FileText } from 'lucide-react';

const features = [
  {
    icon: Bot,
    title: 'Intelligent RAG Engine',
    description: 'Answers are grounded in authentic NCERT text. No hallucinations. Every response includes direct citations to the textbook chapter and page.',
    colorClass: 'text-primary',
    bgClass: 'bg-primary/20',
  },
  {
    icon: FileText,
    title: 'Notes Generation Canvas',
    description: 'Ask the tutor to create study notes and watch them generate instantly on a beautiful, resizable split-screen canvas that you can save for later.',
    colorClass: 'text-blue-400',
    bgClass: 'bg-blue-500/20',
  },
  {
    icon: BrainCircuit,
    title: 'Four Learning Modes',
    description: <>Switch between <i>Explain</i>, <i>Solve Problem</i>, <i>Notes</i>, or <i>Quiz Me</i> depending on what you need. Tailored AI reasoning for complex math equations.</>,
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/20',
  }
];

export function Features() {
  return (
    <section className="py-24 bg-card/30 border-y border-white/5 relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything you need to excel</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">Built strictly on the NCERT syllabus, completely private, and highly interactive.</p>
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
