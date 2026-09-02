"use client"

import { useState } from "react"

type PromptModalProps = {
  open: boolean
  title: string
  label: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: (value: string) => void
}

export function PromptModal({
  open,
  title,
  label,
  confirmLabel = "Confirmar",
  onCancel,
  onConfirm,
}: PromptModalProps) {
  const [value, setValue] = useState("")

  if (!open) return null

  function handleConfirm() {
    const trimmed = value.trim()
    if (!trimmed) return
    onConfirm(trimmed)
    setValue("")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          {label}
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            rows={3}
            autoFocus
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setValue("")
              onCancel()
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!value.trim()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
