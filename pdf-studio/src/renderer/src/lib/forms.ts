/**
 * AcroForm reading and filling via pdf-lib. Values are collected in the form
 * panel and applied in one pass so the document is re-saved once, not on every
 * keystroke.
 */
import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFRadioGroup,
  PDFOptionList
} from 'pdf-lib'

export type FormFieldType = 'text' | 'checkbox' | 'dropdown' | 'radio' | 'optionlist' | 'unknown'

export interface FormFieldInfo {
  name: string
  type: FormFieldType
  value: string
  checked: boolean
  options: string[]
}

/** Edited value for a single field (only the relevant member is used). */
export interface FormFieldValue {
  value?: string
  checked?: boolean
}

async function loadForm(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { ignoreEncryption: true })
}

/** Read all interactive form fields and their current values. */
export async function readFormFields(bytes: Uint8Array): Promise<FormFieldInfo[]> {
  const doc = await loadForm(bytes)
  const form = doc.getForm()
  return form.getFields().map((f) => {
    const name = f.getName()
    if (f instanceof PDFTextField) {
      return { name, type: 'text', value: f.getText() ?? '', checked: false, options: [] }
    }
    if (f instanceof PDFCheckBox) {
      return { name, type: 'checkbox', value: '', checked: f.isChecked(), options: [] }
    }
    if (f instanceof PDFDropdown) {
      return {
        name,
        type: 'dropdown',
        value: f.getSelected()[0] ?? '',
        checked: false,
        options: f.getOptions()
      }
    }
    if (f instanceof PDFRadioGroup) {
      return {
        name,
        type: 'radio',
        value: f.getSelected() ?? '',
        checked: false,
        options: f.getOptions()
      }
    }
    if (f instanceof PDFOptionList) {
      return {
        name,
        type: 'optionlist',
        value: f.getSelected()[0] ?? '',
        checked: false,
        options: f.getOptions()
      }
    }
    return { name, type: 'unknown', value: '', checked: false, options: [] }
  })
}

/** Apply edited values to the form and return the updated PDF bytes. */
export async function fillFormFields(
  bytes: Uint8Array,
  values: Record<string, FormFieldValue>
): Promise<Uint8Array> {
  const doc = await loadForm(bytes)
  const form = doc.getForm()
  for (const field of form.getFields()) {
    const v = values[field.getName()]
    if (!v) continue
    try {
      if (field instanceof PDFTextField && v.value !== undefined) {
        field.setText(v.value)
      } else if (field instanceof PDFCheckBox) {
        if (v.checked) field.check()
        else field.uncheck()
      } else if (field instanceof PDFDropdown && v.value) {
        field.select(v.value)
      } else if (field instanceof PDFRadioGroup && v.value) {
        field.select(v.value)
      } else if (field instanceof PDFOptionList && v.value) {
        field.select(v.value)
      }
    } catch {
      // Skip fields that reject a value (e.g. max length) rather than aborting.
    }
  }
  return doc.save({ useObjectStreams: false })
}
