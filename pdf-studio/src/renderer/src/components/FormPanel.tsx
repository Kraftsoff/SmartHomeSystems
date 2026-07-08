import { useEffect, useState } from 'react'
import type { FormFieldInfo, FormFieldValue } from '../lib/forms'

interface FormPanelProps {
  getFields(): Promise<FormFieldInfo[]>
  onApply(values: Record<string, FormFieldValue>): Promise<void>
  onClose(): void
}

/** Side panel for reading and filling interactive AcroForm fields. */
export function FormPanel({ getFields, onApply, onClose }: FormPanelProps): JSX.Element {
  const [fields, setFields] = useState<FormFieldInfo[] | null>(null)
  const [values, setValues] = useState<Record<string, FormFieldValue>>({})
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    let cancelled = false
    getFields().then((f) => {
      if (!cancelled) setFields(f)
    })
    return () => {
      cancelled = true
    }
  }, [getFields])

  const setValue = (name: string, v: FormFieldValue): void =>
    setValues((prev) => ({ ...prev, [name]: { ...prev[name], ...v } }))

  const apply = async (): Promise<void> => {
    setApplying(true)
    try {
      await onApply(values)
    } finally {
      setApplying(false)
    }
  }

  return (
    <aside className="form-panel">
      <div className="form-panel-header">
        <span>Поля формы</span>
        <button className="tbtn icon" onClick={onClose} title="Закрыть">
          ✕
        </button>
      </div>

      <div className="form-panel-body">
        {fields === null && <div className="form-empty">Загрузка…</div>}
        {fields !== null && fields.length === 0 && (
          <div className="form-empty">В документе нет интерактивных полей.</div>
        )}
        {fields?.map((f) => {
          const edited = values[f.name]
          return (
            <label key={f.name} className="form-field">
              <span className="form-field-name">{f.name}</span>
              {f.type === 'text' && (
                <input
                  className="form-input"
                  value={edited?.value ?? f.value}
                  onChange={(e) => setValue(f.name, { value: e.target.value })}
                />
              )}
              {f.type === 'checkbox' && (
                <input
                  type="checkbox"
                  checked={edited?.checked ?? f.checked}
                  onChange={(e) => setValue(f.name, { checked: e.target.checked })}
                />
              )}
              {(f.type === 'dropdown' || f.type === 'radio' || f.type === 'optionlist') && (
                <select
                  className="form-input"
                  value={edited?.value ?? f.value}
                  onChange={(e) => setValue(f.name, { value: e.target.value })}
                >
                  <option value="">—</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              )}
              {f.type === 'unknown' && <span className="form-field-note">не поддерживается</span>}
            </label>
          )
        })}
      </div>

      {fields !== null && fields.length > 0 && (
        <div className="form-panel-footer">
          <button
            className="btn-primary sm"
            onClick={() => void apply()}
            disabled={applying || Object.keys(values).length === 0}
          >
            {applying ? 'Применение…' : 'Применить'}
          </button>
        </div>
      )}
    </aside>
  )
}
