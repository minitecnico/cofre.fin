import { useState, useEffect, useCallback } from 'react';
import {
  Target, Plus, TrendingUp, Calendar, Check, Trash2, Edit2, Calculator,
  Plane, Home, GraduationCap, Car, Heart, Smartphone, Coffee, Gift, Users,
} from 'lucide-react';
import { goalService } from '../services/goals';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, parseAmount, formatDate } from '../utils/format';
import { PIX_KEY_TYPES } from '../constants';
import Modal from './Modal';
import Select from './Select';
import GoalSimulator from './GoalSimulator';
import GoalInvites from './GoalInvites';
import NickCard from './NickCard';
import SharedGoalDetails from './SharedGoalDetails';

const PRESET_COLORS = [
  '#b8e94e', // accent
  '#10b981', // verde
  '#3b82f6', // azul
  '#8b5cf6', // roxo
  '#f59e0b', // amarelo
  '#ef4444', // vermelho
  '#ec4899', // rosa
  '#14b8a6', // teal
];

const ICON_MAP = {
  target: Target,
  plane: Plane,
  home: Home,
  graduation: GraduationCap,
  car: Car,
  heart: Heart,
  smartphone: Smartphone,
  coffee: Coffee,
  gift: Gift,
};

const ICON_PRESETS = [
  { id: 'target', label: 'Genérico' },
  { id: 'plane', label: 'Viagem' },
  { id: 'home', label: 'Casa' },
  { id: 'graduation', label: 'Estudo' },
  { id: 'car', label: 'Carro' },
  { id: 'heart', label: 'Saúde' },
  { id: 'smartphone', label: 'Tech' },
  { id: 'coffee', label: 'Lazer' },
  { id: 'gift', label: 'Presente' },
];

/**
 * Painel de Metas — lista todas as metas do usuário e permite criar, editar,
 * depositar/sacar valor e excluir.
 *
 * Metas coletivas (is_shared) aparecem para todos os participantes; só o dono
 * edita/exclui. O canal Realtime recarrega a lista quando alguém deposita,
 * entra, sai ou convida — por isso o progresso é acompanhado ao vivo.
 */
export default function GoalsList() {
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sharedGoalId, setSharedGoalId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [depositingGoal, setDepositingGoal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [simulatingGoal, setSimulatingGoal] = useState(null);

  // Sem skeleton nos recarregamentos (Realtime) — só no primeiro carregamento.
  const load = useCallback(async () => {
    try {
      const [data, myInvites] = await Promise.all([goalService.list(), goalService.myInvites()]);
      setGoals(data);
      setInvites(myInvites);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return goalService.subscribe(() => {
      load();
      setRefreshKey((k) => k + 1);
    });
  }, [load]);

  async function handleDeposit(goal, amount) {
    if (goal.is_shared) await goalService.contribute(goal.id, amount);
    else await goalService.deposit(goal.id, amount);
    setDepositingGoal(null);
    load();
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    await goalService.remove(confirmDelete.id);
    setConfirmDelete(null);
    load();
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-32 bg-ink-100 animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  const activeGoals = goals.filter((g) => !g.completed);
  const completedGoals = goals.filter((g) => g.completed);
  // Busca na lista (e não guarda o objeto) para o modal refletir o Realtime.
  const sharedGoal = goals.find((g) => g.id === sharedGoalId) || null;

  return (
    <div className="space-y-4">
      <GoalInvites invites={invites} onResponded={load} />
      <NickCard />

      {/* Header / CTA */}
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg md:text-xl font-bold tracking-tight">
          Suas metas <span className="text-sm text-ink-500 font-mono">({goals.length})</span>
        </h3>
        <button
          onClick={() => { setEditing(null); setCreating(true); }}
          className="btn-accent !py-2 !px-3 !text-sm"
        >
          <Plus className="w-4 h-4" /> Nova meta
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="card-flat p-8 md:p-12 text-center">
          <Target className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-3 text-ink-300" strokeWidth={1.75} />
          <p className="font-display text-lg md:text-xl font-bold mb-2">Nenhuma meta ainda</p>
          <p className="text-xs md:text-sm text-ink-500 mb-4">
            Crie metas como "Reserva de emergência", "Viagem", "Notebook novo" e acompanhe o progresso.
          </p>
          <button onClick={() => { setEditing(null); setCreating(true); }} className="btn-accent">
            <Plus className="w-5 h-5" /> Criar primeira meta
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                isOwner={goal.user_id === user?.id}
                onDeposit={() => setDepositingGoal(goal)}
                onEdit={() => { setEditing(goal); setCreating(true); }}
                onDelete={() => setConfirmDelete(goal)}
                onSimulate={() => setSimulatingGoal(goal)}
                onShared={() => setSharedGoalId(goal.id)}
              />
            ))}
          </div>

          {completedGoals.length > 0 && (
            <div>
              <h4 className="text-[10px] uppercase tracking-widest font-bold text-ink-500 mt-6 mb-2">
                ✓ Concluídas ({completedGoals.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 opacity-70">
                {completedGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    isOwner={goal.user_id === user?.id}
                    onDeposit={() => setDepositingGoal(goal)}
                    onEdit={() => { setEditing(goal); setCreating(true); }}
                    onDelete={() => setConfirmDelete(goal)}
                    onShared={() => setSharedGoalId(goal.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={creating}
        onClose={() => { setCreating(false); setEditing(null); }}
        title={editing ? 'Editar meta' : 'Nova meta'}
      >
        <GoalForm
          initial={editing}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
          onCancel={() => { setCreating(false); setEditing(null); }}
        />
      </Modal>

      <Modal
        isOpen={!!depositingGoal}
        onClose={() => setDepositingGoal(null)}
        title={depositingGoal?.is_shared ? 'Registrar depósito' : 'Adicionar à meta'}
      >
        {depositingGoal && (
          <DepositForm
            goal={depositingGoal}
            onSaved={(amount) => handleDeposit(depositingGoal, amount)}
            onCancel={() => setDepositingGoal(null)}
          />
        )}
      </Modal>

      <Modal
        isOpen={!!sharedGoal}
        onClose={() => setSharedGoalId(null)}
        title={sharedGoal ? `Meta coletiva · ${sharedGoal.title}` : 'Meta coletiva'}
      >
        {sharedGoal && (
          <SharedGoalDetails
            goal={sharedGoal}
            isOwner={sharedGoal.user_id === user?.id}
            currentUserId={user?.id}
            refreshKey={refreshKey}
            onLeft={() => { setSharedGoalId(null); load(); }}
          />
        )}
      </Modal>

      <Modal
        isOpen={!!simulatingGoal}
        onClose={() => setSimulatingGoal(null)}
        title="Simular meta"
      >
        {simulatingGoal && <GoalSimulator goal={simulatingGoal} />}
      </Modal>

      <Modal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Excluir meta"
      >
        {confirmDelete && (
          <div className="space-y-4">
            <p className="text-sm">
              Tem certeza que deseja excluir <strong>{confirmDelete.title}</strong>?
              {Number(confirmDelete.current_amount) > 0 && (
                <span className="block mt-2 text-ink-700">
                  Você já guardou <strong>{formatCurrency(confirmDelete.current_amount)}</strong> nessa meta.
                </span>
              )}
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <button onClick={() => setConfirmDelete(null)} className="btn-ghost">Cancelar</button>
              <button
                onClick={handleDelete}
                className="flex-1 px-5 py-3 min-h-[44px] bg-negative text-white font-bold rounded-xl shadow-soft-md hover:shadow-soft-lg transition-all duration-200"
              >
                Excluir meta
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Card de meta individual
// ─────────────────────────────────────────────────────────────────────────

function GoalCard({ goal, isOwner, onDeposit, onEdit, onDelete, onSimulate, onShared }) {
  const Icon = ICON_MAP[goal.icon] || Target;
  const target = Number(goal.target_amount);
  const current = Number(goal.current_amount);
  const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const remaining = Math.max(0, target - current);
  const isComplete = goal.completed || current >= target;

  // Se tem prazo, calcula dias restantes
  let deadlineInfo = null;
  if (goal.deadline) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = goal.deadline.split('-').map(Number);
    const deadline = new Date(y, m - 1, d);
    const diffDays = Math.floor((deadline - today) / (1000 * 60 * 60 * 24));
    deadlineInfo = {
      formatted: formatDate(goal.deadline, 'long'),
      diffDays,
      late: diffDays < 0 && !isComplete,
    };
  }

  return (
    <div
      className="rounded-2xl shadow-soft hover:shadow-soft-md border border-ink-200 bg-white p-4 md:p-5 transition-all duration-200"
    >
      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-soft"
          style={{ backgroundColor: goal.color }}
        >
          <Icon className="w-5 h-5 text-ink-900" strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-display font-bold text-base md:text-lg tracking-tight truncate">
              {goal.title}
            </h4>
            {isComplete && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-positive text-white">
                <Check className="w-3 h-3" strokeWidth={3} /> Pronto
              </span>
            )}
            {goal.is_shared && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-ink-900 text-white">
                <Users className="w-3 h-3" strokeWidth={2.5} /> Coletiva
              </span>
            )}
          </div>
          {goal.description && (
            <p className="text-xs text-ink-500 mt-0.5 line-clamp-1">{goal.description}</p>
          )}
        </div>

        <div className="flex gap-1 flex-shrink-0">
          {goal.is_shared && (
            <button
              onClick={onShared}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:text-ink-900 hover:bg-ink-100 transition-colors"
              title="Participantes e PIX"
              aria-label="Participantes e PIX"
            >
              <Users className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onSimulate}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:text-ink-900 hover:bg-ink-100 transition-colors"
            title="Simular"
            aria-label="Simular meta"
          >
            <Calculator className="w-4 h-4" />
          </button>
          {isOwner && (
          <>
          <button
            onClick={onEdit}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:text-ink-900 hover:bg-ink-100 transition-colors"
            title="Editar"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:text-negative hover:bg-red-50 transition-colors"
            title="Excluir"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          </>
          )}
        </div>
      </div>

      {/* Valores */}
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <p className="font-display font-bold text-xl md:text-2xl">
          {formatCurrency(current)}
        </p>
        <p className="text-xs text-ink-500 font-medium whitespace-nowrap">
          de {formatCurrency(target)}
        </p>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 bg-ink-100 rounded-full overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress}%`, backgroundColor: goal.color }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-ink-500 mb-3">
        <span>{progress.toFixed(0)}%</span>
        {!isComplete && <span>Faltam {formatCurrency(remaining)}</span>}
      </div>

      {/* Prazo */}
      {deadlineInfo && (
        <div className={`flex items-center gap-1.5 text-xs mb-3 ${
          deadlineInfo.late ? 'text-negative font-bold' : 'text-ink-500'
        }`}>
          <Calendar className="w-3.5 h-3.5" />
          {deadlineInfo.late
            ? <span>Prazo passou ({deadlineInfo.formatted})</span>
            : isComplete
              ? <span>Concluída — prazo era {deadlineInfo.formatted}</span>
              : <span>Até {deadlineInfo.formatted} ({deadlineInfo.diffDays} dias)</span>
          }
        </div>
      )}

      {/* Ação principal */}
      {!isComplete && (
        <button
          onClick={onDeposit}
          className="w-full px-4 py-2.5 min-h-[40px] bg-gradient-dark text-white font-bold rounded-xl text-sm hover:shadow-soft-md active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
        >
          <TrendingUp className="w-4 h-4" />
          {goal.is_shared ? 'Registrar depósito' : 'Adicionar valor'}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Form: criar / editar meta
// ─────────────────────────────────────────────────────────────────────────

function GoalForm({ initial, onSaved, onCancel }) {
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [targetAmount, setTargetAmount] = useState(
    initial?.target_amount ? String(initial.target_amount).replace('.', ',') : ''
  );
  const [currentAmount, setCurrentAmount] = useState(
    initial?.current_amount ? String(initial.current_amount).replace('.', ',') : ''
  );
  const [deadline, setDeadline] = useState(initial?.deadline || '');
  const [color, setColor] = useState(initial?.color || '#b8e94e');
  const [icon, setIcon] = useState(initial?.icon || 'target');
  const [isShared, setIsShared] = useState(initial?.is_shared || false);
  const [pixKeyType, setPixKeyType] = useState(initial?.pix_key_type || 'cpf');
  const [pixKey, setPixKey] = useState(initial?.pix_key || '');
  const [pixName, setPixName] = useState(initial?.pix_name || '');
  const [pixCity, setPixCity] = useState(initial?.pix_city || '');
  // Em meta coletiva o total vem dos depósitos registrados — não se edita à mão.
  const lockCurrent = isEdit && initial.is_shared;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        target_amount: parseAmount(targetAmount),
        current_amount: parseAmount(currentAmount) || 0,
        deadline: deadline || null,
        color, icon,
        is_shared: isShared,
        pix_key: isShared ? pixKey.trim() || null : null,
        pix_key_type: isShared ? pixKeyType : null,
        pix_name: isShared ? pixName.trim() || null : null,
        pix_city: isShared ? pixCity.trim() || null : null,
      };
      if (lockCurrent) delete payload.current_amount;
      if (!payload.title) throw new Error('Informe um título');
      if (!payload.target_amount || payload.target_amount <= 0) {
        throw new Error('Informe um valor alvo válido');
      }
      if (isShared && (!payload.pix_key || !payload.pix_name || !payload.pix_city)) {
        throw new Error('Informe a chave PIX, o titular e a cidade da conta da meta');
      }

      if (isEdit) {
        await goalService.update(initial.id, payload);
      } else {
        await goalService.create(payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Título</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Reserva de emergência"
          className="input-field"
          autoFocus
          maxLength={80}
        />
      </div>

      <div>
        <label className="label">Descrição (opcional)</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex: 6 meses de salário"
          className="input-field"
          maxLength={120}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Valor alvo</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-500 font-mono pointer-events-none">R$</span>
            <input
              type="text"
              inputMode="decimal"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="5.000,00"
              className="input-field pl-10 font-mono text-right"
            />
          </div>
        </div>

        {!lockCurrent && (
        <div>
          <label className="label">Já guardado{!isEdit && ' (opcional)'}</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-500 font-mono pointer-events-none">R$</span>
            <input
              type="text"
              inputMode="decimal"
              value={currentAmount}
              onChange={(e) => setCurrentAmount(e.target.value)}
              placeholder="0,00"
              className="input-field pl-10 font-mono text-right"
            />
          </div>
        </div>
        )}
      </div>

      <div>
        <label className="label">Prazo (opcional)</label>
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="input-field"
        />
      </div>

      {/* Meta coletiva — uma vez compartilhada, não volta a ser individual */}
      <div className="rounded-xl bg-ink-50 p-3 space-y-3">
        <label className={`flex items-start gap-3 ${initial?.is_shared ? '' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={isShared}
            onChange={(e) => setIsShared(e.target.checked)}
            disabled={initial?.is_shared}
            className="mt-1 w-4 h-4 accent-ink-900"
          />
          <span>
            <span className="font-bold text-sm flex items-center gap-1.5"><Users className="w-4 h-4" /> Meta coletiva</span>
            <span className="block text-xs text-ink-500">
              Junte dinheiro com outras pessoas (ex.: viagem do casal). Cada um entra com o próprio login
              depois de aceitar o convite e acompanha o progresso em tempo real.
            </span>
          </span>
        </label>

        {isShared && (
          <div className="space-y-3 animate-slide-up">
            <p className="text-xs font-bold text-ink-700">Conta onde todos vão depositar via PIX</p>
            <Select label="Tipo da chave" value={pixKeyType} onChange={setPixKeyType} options={PIX_KEY_TYPES} />
            <div>
              <label className="label">Chave PIX</label>
              <input className="input-field" value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="Chave da conta da meta" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Titular da conta</label>
                <input className="input-field" value={pixName} onChange={(e) => setPixName(e.target.value)} placeholder="Como aparece no PIX" />
              </div>
              <div>
                <label className="label">Cidade</label>
                <input className="input-field" value={pixCity} onChange={(e) => setPixCity(e.target.value)} placeholder="Ex: Recife" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="label">Ícone</label>
        <div className="grid grid-cols-3 sm:grid-cols-3 gap-2">
          {ICON_PRESETS.map((p) => {
            const Icon = ICON_MAP[p.id];
            const active = icon === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setIcon(p.id)}
                className={`px-3 py-2.5 min-h-[44px] rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all duration-200 ${
                  active
                    ? 'bg-gradient-dark text-white shadow-soft'
                    : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="label">Cor</label>
        <div className="flex gap-2 flex-wrap">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-10 h-10 rounded-xl transition-all shadow-soft ${
                color === c ? 'ring-2 ring-ink-900 ring-offset-2 scale-110' : 'hover:scale-105'
              }`}
              style={{ backgroundColor: c }}
              aria-label={`Cor ${c}`}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-negative text-negative text-sm rounded-xl">{error}</div>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-3">
        <button type="button" onClick={onCancel} className="btn-ghost">Cancelar</button>
        <button type="submit" disabled={submitting} className="btn-accent flex-1">
          {submitting ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar meta'}
        </button>
      </div>
    </form>
  );
}

function DepositForm({ goal, onSaved, onCancel }) {
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const value = parseAmount(amount);
  const newTotal = Number(goal.current_amount) + value;
  const willComplete = newTotal >= Number(goal.target_amount);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!value || value <= 0) {
      setError('Informe um valor válido');
      return;
    }
    setSubmitting(true);
    try {
      await onSaved(value);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="px-4 py-3 bg-ink-50 rounded-xl">
        <p className="text-xs uppercase tracking-widest font-bold text-ink-500">Meta</p>
        <p className="font-bold text-sm md:text-base mt-0.5">{goal.title}</p>
        <p className="text-xs text-ink-500 mt-1">
          Atual: <span className="font-mono font-bold">{formatCurrency(goal.current_amount)}</span>
          {' / '}
          {formatCurrency(goal.target_amount)}
        </p>
      </div>

      <div>
        <label className="label">{goal.is_shared ? 'Quanto você depositou no PIX da meta?' : 'Quanto guardou agora?'}</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-500 font-mono pointer-events-none">R$</span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100,00"
            className="input-field pl-10 font-mono text-right text-lg"
            autoFocus
          />
        </div>
      </div>

      {value > 0 && (
        <div className={`px-4 py-3 rounded-xl ${willComplete ? 'bg-gradient-accent text-ink-900' : 'bg-ink-50'}`}>
          {willComplete ? (
            <p className="font-bold text-sm flex items-center gap-2">
              <Check className="w-4 h-4" /> Você vai completar a meta! 🎉
            </p>
          ) : (
            <p className="text-xs">
              Após o depósito: <strong className="font-mono">{formatCurrency(newTotal)}</strong>
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-negative text-negative text-sm rounded-xl">{error}</div>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-3">
        <button type="button" onClick={onCancel} className="btn-ghost">Cancelar</button>
        <button type="submit" disabled={submitting} className="btn-accent flex-1">
          {submitting ? 'Salvando…' : 'Adicionar'}
        </button>
      </div>
    </form>
  );
}
