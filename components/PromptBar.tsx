'use client';

import { useState } from 'react';

interface Props {
  onSubmit: (prompt: string) => void;
  busy?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function PromptBar({
  onSubmit,
  busy,
  placeholder = 'describe a world…',
  autoFocus,
}: Props) {
  const [value, setValue] = useState('');

  const submit = () => {
    const v = value.trim();
    if (!v || busy) return;
    onSubmit(v);
  };

  return (
    <div className="flex w-full items-center gap-2 rounded-full border border-ink-500 bg-ink-800/80 p-1.5 pl-5 backdrop-blur transition-colors focus-within:border-paper-400">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder={placeholder}
        autoFocus={autoFocus}
        spellCheck={false}
        autoComplete="off"
        disabled={busy}
        className="min-w-0 flex-1 bg-transparent text-[15px] text-paper-100 placeholder:text-paper-400 focus:outline-none disabled:opacity-50"
      />
      <button
        onClick={submit}
        disabled={busy || value.trim().length === 0}
        className="shrink-0 rounded-full bg-paper-100 px-5 py-2 text-sm font-medium text-ink-900 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
      >
        {busy ? 'building…' : 'generate'}
      </button>
    </div>
  );
}
