const { app, BrowserWindow, dialog } = require('electron/main')

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1080,
    height: 720,
    autoHideMenuBar: true,
    resizable: false,
  })

  win.loadFile('index.html')

  win.on('close', async (e) => {
    e.preventDefault()

    let hasChanges = false
    try {
      hasChanges = await win.webContents.executeJavaScript('window.__hasUnsavedChanges === true')
    } catch {}

    if (!hasChanges) {
      win.destroy()
      return
    }

    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Sair sem salvar', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      title: 'Alterações não salvas',
      message: 'Há alterações não salvas.',
      detail: 'Se sair agora, as alterações serão perdidas. Deseja continuar?',
    })

    if (response === 0) win.destroy()
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
