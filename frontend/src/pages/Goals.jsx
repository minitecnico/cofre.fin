import { useState } from 'react';
import { Target, StickyNote, Sparkles } from 'lucide-react';
import GoalsList from '../components/GoalsList';
import NotesEditor from '../components/NotesEditor';

/**
 * Página Objetivos — hub com 2 abas:
 *   - Metas (objetivos com prazo e valor alvo)
 *   - Notas (bloco de notas estilo post-it)
 *
 * Cada componente é independente e gerencia seu próprio estado.
 */
export default function GoalsPage() {
  const [activeTab, setActiveTab] = useState('goals');

  const tabs = [
    { id: 'goals', label: 'Metas', shortLabel: 'Metas', icon: Target },
    { id: 'notes', label: 'Notas', shortLabel: 'Notas', icon: StickyNote },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] md:text-xs uppercase tracking-widest text-ink-500 font-semibold">
          Crescimento
        </p>
        <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mt-1 leading-tight tracking-tight flex items-center gap-2 md:gap-3">
          <Sparkles className="w-7 h-7 md:w-10 md:h-10 flex-shrink-0 text-accent" strokeWidth={2.25} fill="currentColor" />
          <span>Objetivos</span>
        </h1>
        <p className="text-sm md:text-base text-ink-500 mt-1">
          Construa hábitos, alcance metas e organize suas ideias.
        </p>
      </div>

      {/* Tabs */}
      <div className="card-flat p-1.5 flex gap-1">
        {tabs.map(({ id, label, shortLabel, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 px-2 sm:px-3 py-2.5 min-h-[44px] rounded-xl text-xs md:text-sm font-bold transition-all duration-200 flex items-center justify-center gap-1.5 md:gap-2 ${
                active
                  ? 'bg-gradient-dark text-white shadow-soft'
                  : 'bg-transparent text-ink-600 hover:bg-ink-100'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={2.25} />
              <span className="truncate hidden sm:inline">{label}</span>
              <span className="truncate sm:hidden">{shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      <div className="animate-fade-in" key={activeTab}>
        {activeTab === 'goals' && <GoalsList />}
        {activeTab === 'notes' && <NotesEditor />}
      </div>
    </div>
  );
}
