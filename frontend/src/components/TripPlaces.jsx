import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Crosshair, LocateFixed, Download, Pencil, Trash2, Navigation, Loader2, Check, CloudOff, X, MapPin, Map as MapIcon,
} from 'lucide-react';
import Modal from './Modal';
import TripMap from './TripMap';
import { useGeolocation } from '../hooks/useGeolocation';
import { PLACE_KINDS, placeKind } from '../constants';
import { distanceMeters, compassDirection, formatDistance, routeUrl } from '../utils/geo';
import { travelErrorMessage } from '../services/travel';
import {
  OFFLINE_MAX_ZOOM, OFFLINE_MAX_TILES, countAreaTiles, saveArea, countSavedTiles, clearSavedTiles,
} from '../services/mapTiles';

/**
 * Mapa da viagem: marca pousadas, restaurantes, píer... no ponto exato onde
 * você está (GPS) ou tocando no mapa. Tudo funciona sem internet: o GPS não
 * precisa de rede, o mapa usa o que foi salvo no aparelho e o lugar novo
 * entra na fila de envio.
 *
 * `places` traz todos os lugares da pessoa: os desta viagem e, separados, os
 * marcados em outras — voltando à mesma cidade, eles estão lá.
 */
export default function TripPlaces({ tripId, places, offline, onAdd, onUpdate, onRemove, onConfirm, onNotify }) {
  const { position: me, error: gpsError } = useGeolocation(true);
  const mapRef = useRef(null);
  const [pick, setPick] = useState(null); // ponto tocado no mapa
  const [selected, setSelected] = useState(null); // lugar tocado no mapa
  const [draft, setDraft] = useState(null); // { source: 'gps'|'map', lat?, lng?, accuracy? } | { place }
  const [showOffline, setShowOffline] = useState(false);

  // Marcando pelo GPS: com o form aberto, fica com a leitura mais precisa.
  const draftSource = draft?.source;
  useEffect(() => {
    if (draftSource !== 'gps' || !me) return;
    setDraft((d) => (d?.source === 'gps' && (d.accuracy == null || me.accuracy < d.accuracy) ? { ...d, ...me } : d));
  }, [me, draftSource]);

  const sorted = useMemo(() => {
    const list = places.map((p) => ({ ...p, distance: me ? distanceMeters(me, p) : null }));
    return me ? list.sort((a, b) => a.distance - b.distance) : list;
  }, [places, me]);
  const tripPlaces = useMemo(() => places.filter((p) => p.trip_id === tripId), [places, tripId]);
  const mine = sorted.filter((p) => p.trip_id === tripId);
  const others = sorted.filter((p) => p.trip_id !== tripId);

  function focus(p) {
    mapRef.current?.setView([p.lat, p.lng], Math.max(mapRef.current.getZoom(), 17));
    setSelected(p);
  }

  async function submit(fields) {
    if (draft.place) {
      await onUpdate(draft.place, fields);
    } else {
      const queued = await onAdd({ ...fields, lat: draft.lat, lng: draft.lng, accuracy_m: draft.accuracy ?? null });
      if (queued) onNotify('Sem internet — o lugar ficou salvo no aparelho e será enviado quando a conexão voltar.');
    }
    setDraft(null);
    setPick(null);
  }

  function askRemove(p) {
    setDraft(null);
    onConfirm({
      title: p.pending ? 'Descartar lugar' : 'Excluir lugar',
      message: p.pending
        ? `“${p.name}” ainda não foi enviado. Descartar apaga ele deste aparelho.`
        : `Excluir “${p.name}” do mapa? Ele some também das próximas viagens.`,
      confirmLabel: p.pending ? 'Descartar' : 'Excluir',
      tone: 'danger',
      onConfirm: async () => {
        await onRemove(p, 'place');
        setSelected(null);
      },
    });
  }

  const selectedNow = selected && sorted.find((p) => p.id === selected.id);

  return (
    <div className="space-y-3">
      <div className="card-flat overflow-hidden">
        <div className="relative">
          <TripMap
            places={places}
            framePlaces={tripPlaces}
            me={me}
            pick={pick}
            onPick={(pt) => { setPick(pt); setSelected(null); }}
            onSelectPlace={(p) => { setSelected(p); setPick(null); }}
            mapRef={mapRef}
          />
          <button
            type="button"
            onClick={() => me && mapRef.current?.setView([me.lat, me.lng], Math.max(mapRef.current.getZoom(), 16))}
            disabled={!me}
            className="absolute top-3 right-3 z-10 w-11 h-11 rounded-xl bg-white shadow-soft-md border border-hairline-light flex items-center justify-center text-ink-800 disabled:text-ink-300"
            aria-label="Centralizar em mim"
            title="Centralizar em mim"
          >
            <LocateFixed className="w-5 h-5" />
          </button>

          {pick && (
            <MapSheet onClose={() => setPick(null)}>
              <p className="text-sm font-semibold text-ink-900 flex-1">Marcar este ponto?</p>
              <button type="button" onClick={() => setDraft({ source: 'map', ...pick, accuracy: null })} className="btn-pill-sm bg-ink-900 text-white hover:bg-ink-800">
                <MapPin className="w-4 h-4" /> Marcar aqui
              </button>
            </MapSheet>
          )}
          {!pick && selectedNow && (
            <MapSheet onClose={() => setSelected(null)}>
              <span className="text-xl leading-none">{placeKind(selectedNow.kind).emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900 truncate">{selectedNow.name}</p>
                {selectedNow.distance != null && (
                  <p className="text-xs text-ink-500">{formatDistance(selectedNow.distance)} · {compassDirection(me, selectedNow)}</p>
                )}
              </div>
              <a href={routeUrl(selectedNow)} target="_blank" rel="noreferrer" className="btn-pill-sm bg-ink-900 text-white hover:bg-ink-800">
                <Navigation className="w-4 h-4" /> Rota
              </a>
            </MapSheet>
          )}
        </div>

        <div className="p-3 md:p-4 space-y-3">
          <p className={`text-xs flex items-center gap-1.5 ${me ? 'text-ink-500' : 'text-warn font-semibold'}`}>
            <Crosshair className="w-3.5 h-3.5 flex-shrink-0" />
            {me ? `GPS ativo · precisão de ${Math.round(me.accuracy)} m` : gpsError || 'Procurando o GPS…'}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={() => { setDraft({ source: 'gps', ...(me || {}) }); setPick(null); }} className="btn-primary flex-1">
              <Crosshair className="w-5 h-5" /> Marcar onde estou
            </button>
            <button type="button" onClick={() => setShowOffline((v) => !v)} className={`btn-ghost flex-1 ${showOffline ? 'ring-2 ring-ink-900' : ''}`}>
              <Download className="w-5 h-5" /> Mapa offline
            </button>
          </div>
          <p className="text-[11px] text-ink-400 text-center">Ou toque no mapa para marcar outro ponto.</p>
          {showOffline && <OfflineMapPanel mapRef={mapRef} offline={offline} onConfirm={onConfirm} />}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="card-flat p-8 text-center">
          <MapIcon className="w-10 h-10 mx-auto mb-3 text-ink-300" strokeWidth={1.75} />
          <p className="text-sm text-ink-500">Nenhum lugar marcado. Chegou na pousada? Toque em “Marcar onde estou”.</p>
        </div>
      ) : (
        <>
          {mine.length > 0 && <PlaceList title="Nesta viagem" items={mine} me={me} onFocus={focus} onEdit={(p) => setDraft({ place: p })} />}
          {others.length > 0 && (
            <PlaceList title="De outras viagens" items={others} me={me} onFocus={focus} onEdit={(p) => setDraft({ place: p })} showTrip />
          )}
        </>
      )}

      <Modal isOpen={!!draft} onClose={() => setDraft(null)} title={draft?.place ? 'Editar lugar' : 'Marcar lugar'}>
        {draft && (
          <PlaceForm
            initial={draft.place || null}
            point={draft.place || (draft.lat != null ? draft : null)}
            fromGps={draft.source === 'gps'}
            onSubmit={submit}
            onCancel={() => setDraft(null)}
            onDelete={draft.place ? () => askRemove(draft.place) : null}
          />
        )}
      </Modal>
    </div>
  );
}

/** Uma seção da lista de lugares. Excluir fica dentro do Editar (com confirmação). */
function PlaceList({ title, items, me, onFocus, onEdit, showTrip }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] md:text-xs uppercase tracking-widest text-ink-500 font-semibold px-1">{title}</h3>
      <ul className="card-flat overflow-hidden divide-y divide-ink-100">
        {items.map((p) => {
          const kind = placeKind(p.kind);
          return (
            <li key={p.id} className="px-4 py-3 flex items-start gap-3">
              <button
                type="button"
                onClick={() => onFocus(p)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                style={{ background: `${kind.color}22` }}
                aria-label="Ver no mapa"
              >
                {kind.emoji}
              </button>
              <button type="button" onClick={() => onFocus(p)} className="min-w-0 flex-1 text-left">
                <p className="text-sm font-semibold text-ink-900 truncate">{p.name}</p>
                <p className="text-xs text-ink-500">
                  {kind.label}
                  {p.distance != null && ` · ${formatDistance(p.distance)} ${compassDirection(me, p)}`}
                </p>
                {showTrip && p.trip?.name && <p className="text-[11px] text-ink-400 truncate">Marcado em: {p.trip.name}</p>}
                {p.notes && <p className="text-xs text-ink-600 mt-0.5 line-clamp-2 whitespace-pre-line">{p.notes}</p>}
                {p.pending && (
                  <p className={`text-[11px] font-semibold mt-0.5 flex items-center gap-1 ${p.sendError ? 'text-negative' : 'text-ink-500'}`}>
                    <CloudOff className="w-3 h-3" /> {p.sendError ? `Não enviado: ${p.sendError}` : 'Aguardando internet'}
                  </p>
                )}
              </button>
              <div className="flex items-center">
                <a href={routeUrl(p)} target="_blank" rel="noreferrer" className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-500 hover:bg-ink-100" aria-label="Rota" title="Rota no Google Maps">
                  <Navigation className="w-4 h-4" />
                </a>
                <button type="button" onClick={() => onEdit(p)} className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-500 hover:bg-ink-100" aria-label="Editar">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Faixa na base do mapa (ponto escolhido / lugar tocado). */
function MapSheet({ onClose, children }) {
  return (
    <div className="absolute left-3 right-3 bottom-3 z-10 bg-white rounded-2xl shadow-soft-lg border border-hairline-light p-2.5 pl-3.5 flex items-center gap-2.5 animate-slide-up">
      {children}
      <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-500 hover:bg-ink-100 flex-shrink-0" aria-label="Fechar">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function PlaceForm({ initial, point, fromGps, onSubmit, onCancel, onDelete }) {
  const [name, setName] = useState(initial?.name || '');
  const [kind, setKind] = useState(initial?.kind || 'hospedagem');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Dê um nome ao lugar');
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), kind, notes: notes.trim() || null });
    } catch (err) {
      setError(travelErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const accuracy = point?.accuracy ?? point?.accuracy_m;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className={`px-3 py-2.5 rounded-xl text-xs flex items-start gap-2 ${point ? 'bg-ink-50 text-ink-600' : 'bg-amber-50 text-amber-700'}`}>
        {point ? <MapPin className="w-4 h-4 flex-shrink-0 mt-px" /> : <Loader2 className="w-4 h-4 flex-shrink-0 mt-px animate-spin" />}
        {point ? (
          <span>
            <span className="font-mono">{point.lat.toFixed(6)}, {point.lng.toFixed(6)}</span>
            {accuracy != null && <span> · precisão de {Math.round(accuracy)} m</span>}
            {fromGps && !initial && <span className="block mt-0.5">Fique parado uns segundos — a posição vai ficando mais precisa sozinha.</span>}
          </span>
        ) : (
          <span>Procurando o sinal do GPS… em lugar aberto pega mais rápido.</span>
        )}
      </div>

      <div>
        <label className="label">Nome</label>
        <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Pousada do Pescador" autoFocus={!initial} required />
      </div>

      <div>
        <label className="label">Tipo</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PLACE_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              className={`min-h-[44px] px-3 rounded-xl border text-sm font-semibold flex items-center gap-2 transition-colors ${
                kind === k.value ? 'border-ink-900 ring-1 ring-ink-900 bg-white' : 'border-ink-200 bg-ink-50 text-ink-700 hover:bg-ink-100'
              }`}
            >
              <span className="text-base leading-none">{k.emoji}</span>
              <span className="truncate">{k.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Anotações (opcional)</label>
        <textarea
          className="input-field min-h-[88px] resize-y"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
          placeholder="Telefone, preço da diária, horário do barco…"
        />
      </div>

      {error && <p className="text-sm text-negative font-medium">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-ghost flex-1 min-h-[48px]">Cancelar</button>
        <button type="submit" disabled={saving || !point} className="btn-primary flex-1 min-h-[48px] disabled:opacity-60">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          Salvar
        </button>
      </div>
      {onDelete && (
        <button type="button" onClick={onDelete} className="btn-danger w-full">
          <Trash2 className="w-4 h-4" /> {initial?.pending ? 'Descartar lugar' : 'Excluir lugar'}
        </button>
      )}
    </form>
  );
}

/**
 * Salva no aparelho o mapa da área visível (do zoom atual − 2 até o 16), pra
 * usar onde não pega internet. O que você já viu no mapa também fica salvo.
 */
function OfflineMapPanel({ mapRef, offline, onConfirm }) {
  const [saved, setSaved] = useState(null);
  const [progress, setProgress] = useState(null); // { done, total }
  const [message, setMessage] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    countSavedTiles().then(setSaved);
    return () => abortRef.current?.abort();
  }, []);

  async function save() {
    const map = mapRef.current;
    if (!map) return;
    const fromZoom = Math.max(1, Math.min(map.getZoom(), OFFLINE_MAX_ZOOM) - 2);
    const total = countAreaTiles(map.getBounds(), fromZoom);
    if (total > OFFLINE_MAX_TILES) {
      setMessage(`Área grande demais (${total.toLocaleString('pt-BR')} partes de mapa; o limite é ${OFFLINE_MAX_TILES.toLocaleString('pt-BR')}). Aproxime o mapa na região da viagem e tente de novo.`);
      return;
    }
    setMessage(null);
    abortRef.current = new AbortController();
    setProgress({ done: 0, total });
    try {
      const { failed } = await saveArea(map.getBounds(), fromZoom, {
        signal: abortRef.current.signal,
        onProgress: (done) => setProgress({ done, total }),
      });
      if (abortRef.current.signal.aborted) setMessage('Download interrompido — o que já baixou ficou salvo.');
      else setMessage(failed ? `Pronto, mas ${failed} partes falharam — tente de novo com sinal melhor.` : 'Pronto! Esta área abre sem internet.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setProgress(null);
      countSavedTiles().then(setSaved);
    }
  }

  function askClear() {
    onConfirm({
      title: 'Apagar mapas salvos',
      message: 'Apaga do aparelho os mapas salvos de todas as viagens. Os lugares marcados não são apagados.',
      confirmLabel: 'Apagar mapas',
      tone: 'danger',
      onConfirm: async () => {
        await clearSavedTiles();
        setSaved(0);
        setMessage(null);
      },
    });
  }

  return (
    <div className="rounded-xl bg-ink-50 p-3 space-y-2.5 animate-fade-in">
      <p className="text-xs text-ink-600 leading-relaxed">
        Enquadre no mapa a região onde vai ficar e salve. Sem internet, o mapa mostra o que estiver salvo e o GPS continua
        marcando onde você está.
      </p>
      {progress ? (
        <div className="space-y-1.5">
          <div className="h-2 rounded-full bg-ink-200 overflow-hidden">
            <div className="h-full bg-accent-dark rounded-full transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs text-ink-600">
            <span>Baixando {progress.done} de {progress.total}…</span>
            <button type="button" onClick={() => abortRef.current?.abort()} className="font-semibold hover:text-negative">Parar</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2">
          <button type="button" onClick={save} disabled={offline} className="btn-pill-sm bg-ink-900 text-white hover:bg-ink-800 flex-1 disabled:opacity-50">
            <Download className="w-4 h-4" /> {offline ? 'Precisa de internet' : 'Salvar esta área'}
          </button>
          {saved > 0 && (
            <button type="button" onClick={askClear} className="btn-pill-sm bg-white border border-ink-200 text-ink-700 flex-1">
              <Trash2 className="w-4 h-4" /> Apagar mapas salvos
            </button>
          )}
        </div>
      )}
      {message && <p className="text-xs font-semibold text-ink-800">{message}</p>}
      {saved != null && (
        <p className="text-[11px] text-ink-500">{saved.toLocaleString('pt-BR')} partes de mapa salvas neste aparelho.</p>
      )}
    </div>
  );
}
