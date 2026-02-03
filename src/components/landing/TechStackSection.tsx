import { Atom, FileCode2, Wind, Database, Droplets, Layers, type LucideIcon } from 'lucide-react';

const techStack: { name: string; icon: LucideIcon }[] = [
  { name: 'React 19', icon: Atom },
  { name: 'TypeScript', icon: FileCode2 },
  { name: 'Tailwind v4', icon: Wind },
  { name: 'PostgreSQL', icon: Database },
  { name: 'Drizzle ORM', icon: Droplets },
  { name: 'shadcn/ui', icon: Layers },
];

export default function TechStackSection() {
  return (
    <section className="relative py-12 sm:py-16 px-4 border-y border-border bg-card/20">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap justify-center gap-3 stagger-children">
          {techStack.map((tech) => {
            const Icon = tech.icon;
            return (
              <div key={tech.name} className="tech-badge">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span>{tech.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
