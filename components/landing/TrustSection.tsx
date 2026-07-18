import { CheckCircle2 } from 'lucide-react';

const trustItems = [
  {
    title: 'Syllabus Constrained',
    description: 'Rejects out-of-bounds questions'
  },
  {
    title: 'DPDP Compliant',
    description: 'Full data deletion capabilities'
  },
  {
    title: 'Distress Protection',
    description: 'Built-in safeguards and helplines'
  }
];

export function TrustSection() {
  return (
    <section className="py-24 px-6 relative overflow-hidden">
      <div className="max-w-4xl mx-auto text-center space-y-8">
        <h2 className="text-3xl md:text-5xl font-bold">Safe, Private, & Accurate</h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 md:gap-12 pt-8 text-left">
          {trustItems.map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-primary flex-shrink-0" />
              <div>
                <h4 className="font-semibold">{item.title}</h4>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
