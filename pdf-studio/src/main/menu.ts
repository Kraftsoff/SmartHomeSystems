import { Menu, BrowserWindow, app, dialog, type MenuItemConstructorOptions } from 'electron'
import { IpcChannels, type MenuCommand, type DocumentState } from '../shared/ipc'

function send(window: BrowserWindow, command: MenuCommand): void {
  window.webContents.send(IpcChannels.menuCommand, command)
}

/**
 * Build the native application menu. Re-invoked whenever document state changes
 * so that items like "Save" or "Rotate page" are disabled with no document open.
 */
export function buildMenu(window: BrowserWindow, getState: () => DocumentState): void {
  const state = getState()
  const hasDoc = state.hasDocument

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Файл',
      submenu: [
        {
          label: 'Открыть…',
          accelerator: 'CmdOrCtrl+O',
          click: () => send(window, 'open')
        },
        { type: 'separator' },
        {
          label: 'Сохранить',
          accelerator: 'CmdOrCtrl+S',
          enabled: hasDoc && state.isDirty,
          click: () => send(window, 'save')
        },
        {
          label: 'Сохранить как…',
          accelerator: 'CmdOrCtrl+Shift+S',
          enabled: hasDoc,
          click: () => send(window, 'save-as')
        },
        { type: 'separator' },
        {
          label: 'Закрыть документ',
          accelerator: 'CmdOrCtrl+W',
          enabled: hasDoc,
          click: () => send(window, 'close-document')
        },
        { type: 'separator' },
        { label: 'Выход', role: 'quit' }
      ]
    },
    {
      label: 'Правка',
      submenu: [
        {
          label: 'Отменить',
          accelerator: 'CmdOrCtrl+Z',
          enabled: state.canUndo,
          click: () => send(window, 'undo')
        },
        {
          label: 'Повторить',
          accelerator: 'CmdOrCtrl+Shift+Z',
          enabled: state.canRedo,
          click: () => send(window, 'redo')
        },
        { type: 'separator' },
        {
          label: 'Найти…',
          accelerator: 'CmdOrCtrl+F',
          enabled: hasDoc,
          click: () => send(window, 'find')
        }
      ]
    },
    {
      label: 'Вид',
      submenu: [
        {
          label: 'Увеличить',
          accelerator: 'CmdOrCtrl+Plus',
          enabled: hasDoc,
          click: () => send(window, 'zoom-in')
        },
        {
          label: 'Уменьшить',
          accelerator: 'CmdOrCtrl+-',
          enabled: hasDoc,
          click: () => send(window, 'zoom-out')
        },
        {
          label: 'Сбросить масштаб',
          accelerator: 'CmdOrCtrl+0',
          enabled: hasDoc,
          click: () => send(window, 'zoom-reset')
        },
        { type: 'separator' },
        {
          label: 'Следующая страница',
          accelerator: 'PageDown',
          enabled: hasDoc,
          click: () => send(window, 'next-page')
        },
        {
          label: 'Предыдущая страница',
          accelerator: 'PageUp',
          enabled: hasDoc,
          click: () => send(window, 'prev-page')
        },
        { type: 'separator' },
        { label: 'Полноэкранный режим', role: 'togglefullscreen' },
        ...(process.env.NODE_ENV === 'development'
          ? [{ label: 'Инструменты разработчика', role: 'toggleDevTools' } as MenuItemConstructorOptions]
          : [])
      ]
    },
    {
      label: 'Страница',
      submenu: [
        {
          label: 'Повернуть на 90°',
          accelerator: 'CmdOrCtrl+R',
          enabled: hasDoc,
          click: () => send(window, 'rotate-page')
        },
        {
          label: 'Удалить страницу',
          accelerator: 'CmdOrCtrl+Backspace',
          enabled: hasDoc,
          click: () => send(window, 'delete-page')
        }
      ]
    },
    {
      label: 'Справка',
      submenu: [
        {
          label: `О программе ${app.name}`,
          click: () => {
            dialog.showMessageBox(window, {
              type: 'info',
              title: 'О программе',
              message: 'PDF Studio',
              detail:
                'Удобный и комфортный PDF-редактор для Windows.\n\n' +
                `Версия ${app.getVersion()}\n` +
                'Просмотр, аннотации, операции со страницами и сохранение.'
            })
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
