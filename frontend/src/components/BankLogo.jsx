import { useEffect, useState } from 'react';
import { findBank, getBank } from '../constants/banks';

/**
 * Logo de banco brasileiro (lib @edusites/bancos-brasil — SVGs embutidos,
 * funciona offline).
 *
 * A lib pesa ~110 KB (todos os SVGs), então é carregada sob demanda uma única
 * vez e compartilhada entre todas as instâncias — não infla o bundle inicial.
 *
 * Aceita `bankId` (do catálogo) ou `name` (texto livre: nome do cartão, apelido
 * da chave PIX). Sem banco reconhecido, renderiza `fallback` (ou nada).
 */
let libPromise = null;
const loadLib = () => (libPromise ||= import('@edusites/bancos-brasil'));

export default function BankLogo({ bankId, name, size = 20, className = '', fallback = null }) {
  const bank = bankId ? getBank(bankId) : findBank(name);
  const [svg, setSvg] = useState('');

  useEffect(() => {
    if (!bank) { setSvg(''); return; }
    let alive = true;
    loadLib()
      .then(({ svgBanco }) => { if (alive) setSvg(svgBanco({ nome: bank.id, tamanho: size }) || ''); })
      .catch(() => { if (alive) setSvg(''); });
    return () => { alive = false; };
  }, [bank, size]);

  if (!bank) return fallback;
  return (
    <span
      className={`inline-flex flex-shrink-0 overflow-hidden rounded-[22%] ring-1 ring-black/5 bg-ink-100 ${className}`}
      style={{ width: size, height: size }}
      title={bank.name}
      aria-label={bank.name}
      role="img"
      // SVG estático gerado pela lib a partir dos ícones dela (sem input do usuário).
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
