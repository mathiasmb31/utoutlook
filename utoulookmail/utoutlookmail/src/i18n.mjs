// ============================================================
// i18n.mjs — Internationalisation for UToutlook Mail
//
// Supported languages: fr (default), en, es, de, it, pt, zh, ar
// Usage: import { t, getLanguage, setLanguage, getAvailableLanguages } from './i18n.mjs'
//   t('tray.quit')           → "Quitter" / "Quit" / "Salir" ...
//   t('notif.newMessages.body', { count: 5 }) → "5 messages non lus" / "5 unread messages"
// ============================================================

import {logger} from './logger.mjs';

// --- Available languages ---
export const LANGUAGES = {
    fr: 'Français',
    en: 'English',
    es: 'Español',
    de: 'Deutsch',
    it: 'Italiano',
    pt: 'Português',
    zh: '中文',
    ar: 'العربية',
};

const DEFAULT_LANG = 'fr';

// --- Translations ---
const T = {
    // ===== Common =====
    'app.name': {
        fr: 'UToutlook Mail', en: 'UToutlook Mail', es: 'UToutlook Mail', de: 'UToutlook Mail',
        it: 'UToutlook Mail', pt: 'UToutlook Mail', zh: 'UToutlook Mail', ar: 'UToutlook Mail',
    },
    'common.loading': {
        fr: 'Chargement...', en: 'Loading...', es: 'Cargando...', de: 'Laden...',
        it: 'Caricamento...', pt: 'Carregando...', zh: '加载中...', ar: 'جارٍ التحميل...',
    },
    'common.cancel': {
        fr: 'Annuler', en: 'Cancel', es: 'Cancelar', de: 'Abbrechen',
        it: 'Annulla', pt: 'Cancelar', zh: '取消', ar: 'إلغاء',
    },
    'common.ok': {
        fr: 'OK', en: 'OK', es: 'OK', de: 'OK',
        it: 'OK', pt: 'OK', zh: '确定', ar: 'حسناً',
    },
    'common.quit': {
        fr: 'Quitter', en: 'Quit', es: 'Salir', de: 'Beenden',
        it: 'Esci', pt: 'Sair', zh: '退出', ar: 'خروج',
    },
    'common.show': {
        fr: 'Afficher', en: 'Show', es: 'Mostrar', de: 'Anzeigen',
        it: 'Mostra', pt: 'Mostrar', zh: '显示', ar: 'إظهار',
    },
    'common.reload': {
        fr: 'Recharger', en: 'Reload', es: 'Recargar', de: 'Neu laden',
        it: 'Ricarica', pt: 'Recarregar', zh: '重新加载', ar: 'إعادة تحميل',
    },
    'common.settings': {
        fr: 'Paramètres', en: 'Settings', es: 'Ajustes', de: 'Einstellungen',
        it: 'Impostazioni', pt: 'Configurações', zh: '设置', ar: 'الإعدادات',
    },

    // ===== Tray menu =====
    'tray.show': {
        fr: 'Afficher', en: 'Show', es: 'Mostrar', de: 'Anzeigen',
        it: 'Mostra', pt: 'Mostrar', zh: '显示', ar: 'إظهار',
    },
    'tray.reload': {
        fr: 'Recharger', en: 'Reload', es: 'Recargar', de: 'Neu laden',
        it: 'Ricarica', pt: 'Recarregar', zh: '重新加载', ar: 'إعادة تحميل',
    },
    'tray.accounts': {
        fr: 'Comptes', en: 'Accounts', es: 'Cuentas', de: 'Konten',
        it: 'Account', pt: 'Contas', zh: '账户', ar: 'الحسابات',
    },
    'tray.settings': {
        fr: 'Paramètres', en: 'Settings', es: 'Ajustes', de: 'Einstellungen',
        it: 'Impostazioni', pt: 'Configurações', zh: '设置', ar: 'الإعدادات',
    },
    'tray.quit': {
        fr: 'Quitter', en: 'Quit', es: 'Salir', de: 'Beenden',
        it: 'Esci', pt: 'Sair', zh: '退出', ar: 'خروج',
    },
    'tray.about': {
        fr: 'À propos de UToutlook Mail', en: 'About UToutlook Mail', es: 'Acerca de UToutlook Mail',
        de: 'Über UToutlook Mail', it: 'Informazioni su UToutlook Mail', pt: 'Sobre o UToutlook Mail',
        zh: '关于 UToutlook Mail', ar: 'حول UToutlook Mail',
    },
    'tray.addAccount': {
        fr: '+ Ajouter un compte', en: '+ Add account', es: '+ Añadir cuenta', de: '+ Konto hinzufügen',
        it: '+ Aggiungi account', pt: '+ Adicionar conta', zh: '+ 添加账户', ar: '+ إضافة حساب',
    },
    'tray.removeAccount': {
        fr: '− Supprimer un compte', en: '− Remove account', es: '− Eliminar cuenta',
        de: '− Konto entfernen', it: '− Rimuovi account', pt: '− Remover conta',
        zh: '− 删除账户', ar: '− حذف حساب',
    },
    'tray.startMinimized': {
        fr: 'Démarrer minimisé', en: 'Start Minimized', es: 'Iniciar minimizado',
        de: 'Minimiert starten', it: 'Avvia ridotto', pt: 'Iniciar minimizado',
        zh: '最小化启动', ar: 'بدء مصغراً',
    },
    'tray.hideOnClose': {
        fr: 'Masquer à la fermeture', en: 'Hide on Close', es: 'Ocultar al cerrar',
        de: 'Beim Schließen ausblenden', it: 'Nascondi alla chiusura', pt: 'Ocultar ao fechar',
        zh: '关闭时隐藏', ar: 'إخفاء عند الإغلاق',
    },
    'tray.hideOnMinimize': {
        fr: 'Masquer à la réduction', en: 'Hide on Minimize', es: 'Ocultar al minimizar',
        de: 'Beim Minimieren ausblenden', it: 'Nascondi al ridotto', pt: 'Ocultar ao minimizar',
        zh: '最小化时隐藏', ar: 'إخفاء عند التصغير',
    },
    'tray.showWindowFrame': {
        fr: 'Afficher le cadre de fenêtre', en: 'Show Window Frame', es: 'Mostrar marco de ventana',
        de: 'Fensterrahmen anzeigen', it: 'Mostra cornice finestra', pt: 'Mostrar moldura da janela',
        zh: '显示窗口边框', ar: 'إظهار إطار النافذة',
    },
    'tray.focusMode': {
        fr: 'Mode lecture concentrée', en: 'Focus mode', es: 'Modo concentración',
        de: 'Fokusmodus', it: 'Modalità concentrazione', pt: 'Modo foco',
        zh: '专注模式', ar: 'وضع التركيز',
    },
    'tray.darkMode': {
        fr: 'Mode sombre', en: 'Dark mode', es: 'Modo oscuro', de: 'Dunkelmodus',
        it: 'Modalità scura', pt: 'Modo escuro', zh: '深色模式', ar: 'الوضع الداكن',
    },
    'tray.darkMode.auto': {
        fr: 'Auto (système)', en: 'Auto (system)', es: 'Auto (sistema)',
        de: 'Auto (System)', it: 'Auto (sistema)', pt: 'Auto (sistema)',
        zh: '自动（系统）', ar: 'تلقائي (النظام)',
    },
    'tray.darkMode.on': {
        fr: 'Toujours activé', en: 'Always on', es: 'Siempre activado',
        de: 'Immer an', it: 'Sempre attivo', pt: 'Sempre ligado',
        zh: '始终开启', ar: 'دائماً مفعّل',
    },
    'tray.darkMode.off': {
        fr: 'Toujours désactivé', en: 'Always off', es: 'Siempre desactivado',
        de: 'Immer aus', it: 'Sempre spento', pt: 'Sempre desligado',
        zh: '始终关闭', ar: 'دائماً معطّل',
    },
    'tray.accentColor': {
        fr: "Couleur d'accent", en: 'Accent color', es: 'Color de acento',
        de: 'Akzentfarbe', it: 'Colore accento', pt: 'Cor de destaque',
        zh: '强调色', ar: 'لون التمييز',
    },
    'tray.language': {
        fr: 'Langue', en: 'Language', es: 'Idioma', de: 'Sprache',
        it: 'Lingua', pt: 'Idioma', zh: '语言', ar: 'اللغة',
    },
    'tray.exportSettings': {
        fr: 'Exporter les paramètres', en: 'Export settings', es: 'Exportar ajustes',
        de: 'Einstellungen exportieren', it: 'Esporta impostazioni', pt: 'Exportar configurações',
        zh: '导出设置', ar: 'تصدير الإعدادات',
    },
    'tray.importSettings': {
        fr: 'Importer les paramètres', en: 'Import settings', es: 'Importar ajustes',
        de: 'Einstellungen importieren', it: 'Importa impostazioni', pt: 'Importar configurações',
        zh: '导入设置', ar: 'استيراد الإعدادات',
    },
    'tray.showSettingsFile': {
        fr: 'Afficher le fichier de paramètres', en: 'Show settings file', es: 'Mostrar archivo de ajustes',
        de: 'Einstellungsdatei anzeigen', it: 'Mostra file impostazioni', pt: 'Mostrar arquivo de configurações',
        zh: '显示设置文件', ar: 'إظهار ملف الإعدادات',
    },
    'tray.restoreDefaults': {
        fr: 'Restaurer les paramètres par défaut', en: 'Restore Default Settings', es: 'Restaurar ajustes predeterminados',
        de: 'Standardeinstellungen wiederherstellen', it: 'Ripristina impostazioni predefinite', pt: 'Restaurar configurações padrão',
        zh: '恢复默认设置', ar: 'استعادة الإعدادات الافتراضية',
    },
    'tray.resetAppData': {
        fr: "Réinitialiser les données de l'application", en: 'Reset Application Data', es: 'Restablecer datos de la aplicación',
        de: 'Anwendungsdaten zurücksetzen', it: 'Reimposta dati applicazione', pt: 'Redefinir dados do aplicativo',
        zh: '重置应用数据', ar: 'إعادة تعيين بيانات التطبيق',
    },

    // ===== Colors =====
    'color.blue': {
        fr: 'Bleu Outlook (défaut)', en: 'Outlook Blue (default)', es: 'Azul Outlook (predeterminado)',
        de: 'Outlook-Blau (Standard)', it: 'Blu Outlook (predefinito)', pt: 'Azul Outlook (padrão)',
        zh: 'Outlook 蓝（默认）', ar: 'أزرق Outlook (افتراضي)',
    },
    'color.green': {
        fr: 'Vert', en: 'Green', es: 'Verde', de: 'Grün',
        it: 'Verde', pt: 'Verde', zh: '绿色', ar: 'أخضر',
    },
    'color.purple': {
        fr: 'Violet', en: 'Purple', es: 'Morado', de: 'Lila',
        it: 'Viola', pt: 'Roxo', zh: '紫色', ar: 'بنفسجي',
    },
    'color.pink': {
        fr: 'Rose', en: 'Pink', es: 'Rosa', de: 'Rosa',
        it: 'Rosa', pt: 'Rosa', zh: '粉色', ar: 'وردي',
    },
    'color.orange': {
        fr: 'Orange', en: 'Orange', es: 'Naranja', de: 'Orange',
        it: 'Arancione', pt: 'Laranja', zh: '橙色', ar: 'برتقالي',
    },
    'color.red': {
        fr: 'Rouge', en: 'Red', es: 'Rojo', de: 'Rot',
        it: 'Rosso', pt: 'Vermelho', zh: '红色', ar: 'أحمر',
    },
    'color.turquoise': {
        fr: 'Turquoise', en: 'Turquoise', es: 'Turquesa', de: 'Türkis',
        it: 'Turchese', pt: 'Turquesa', zh: '青绿色', ar: 'فيروزي',
    },

    // ===== Dialogs =====
    'dialog.export.title': {
        fr: 'Exporter les paramètres', en: 'Export settings', es: 'Exportar ajustes',
        de: 'Einstellungen exportieren', it: 'Esporta impostazioni', pt: 'Exportar configurações',
        zh: '导出设置', ar: 'تصدير الإعدادات',
    },
    'dialog.export.success.title': {
        fr: 'Export réussi', en: 'Export successful', es: 'Exportación exitosa',
        de: 'Export erfolgreich', it: 'Esportazione riuscita', pt: 'Exportação bem-sucedida',
        zh: '导出成功', ar: 'تم التصدير بنجاح',
    },
    'dialog.export.success.message': {
        fr: 'Paramètres exportés.', en: 'Settings exported.', es: 'Ajustes exportados.',
        de: 'Einstellungen exportiert.', it: 'Impostazioni esportate.', pt: 'Configurações exportadas.',
        zh: '设置已导出。', ar: 'تم تصدير الإعدادات.',
    },
    'dialog.export.success.detail': {
        fr: 'Fichier : {path}', en: 'File: {path}', es: 'Archivo: {path}',
        de: 'Datei: {path}', it: 'File: {path}', pt: 'Arquivo: {path}',
        zh: '文件：{path}', ar: 'الملف: {path}',
    },
    'dialog.export.error': {
        fr: 'Export échoué', en: 'Export failed', es: 'Error al exportar',
        de: 'Export fehlgeschlagen', it: 'Esportazione fallita', pt: 'Falha na exportação',
        zh: '导出失败', ar: 'فشل التصدير',
    },
    'dialog.import.title': {
        fr: 'Importer les paramètres', en: 'Import settings', es: 'Importar ajustes',
        de: 'Einstellungen importieren', it: 'Importa impostazioni', pt: 'Importar configurações',
        zh: '导入设置', ar: 'استيراد الإعدادات',
    },
    'dialog.import.success.title': {
        fr: 'Import réussi', en: 'Import successful', es: 'Importación exitosa',
        de: 'Import erfolgreich', it: 'Importazione riuscita', pt: 'Importação bem-sucedida',
        zh: '导入成功', ar: 'تم الاستيراد بنجاح',
    },
    'dialog.import.success.message': {
        fr: 'Paramètres importés. Redémarrage recommandé.', en: 'Settings imported. Restart recommended.',
        es: 'Ajustes importados. Reinicio recomendado.', de: 'Einstellungen importiert. Neustart empfohlen.',
        it: 'Impostazioni importate. Riavvio consigliato.', pt: 'Configurações importadas. Reinício recomendado.',
        zh: '设置已导入。建议重启。', ar: 'تم استيراد الإعدادات. يوصى بإعادة التشغيل.',
    },
    'dialog.import.success.detail': {
        fr: "L'application va redémarrer pour appliquer tous les changements.",
        en: 'The application will restart to apply all changes.',
        es: 'La aplicación se reiniciará para aplicar todos los cambios.',
        de: 'Die Anwendung wird neu gestartet, um alle Änderungen zu übernehmen.',
        it: "L'applicazione verrà riavviata per applicare tutte le modifiche.",
        pt: 'O aplicativo será reiniciado para aplicar todas as alterações.',
        zh: '应用将重启以应用所有更改。',
        ar: 'سيتم إعادة تشغيل التطبيق لتطبيق جميع التغييرات.',
    },
    'dialog.import.error': {
        fr: 'Import échoué', en: 'Import failed', es: 'Error al importar',
        de: 'Import fehlgeschlagen', it: 'Importazione fallita', pt: 'Falha na importação',
        zh: '导入失败', ar: 'فشل الاستيراد',
    },
    'dialog.import.error.detail': {
        fr: 'Fichier invalide : {error}', en: 'Invalid file: {error}', es: 'Archivo inválido: {error}',
        de: 'Ungültige Datei: {error}', it: 'File non valido: {error}', pt: 'Arquivo inválido: {error}',
        zh: '无效文件：{error}', ar: 'ملف غير صالح: {error}',
    },
    'dialog.addAccount.title': {
        fr: 'Ajouter un compte', en: 'Add account', es: 'Añadir cuenta',
        de: 'Konto hinzufügen', it: 'Aggiungi account', pt: 'Adicionar conta',
        zh: '添加账户', ar: 'إضافة حساب',
    },
    'dialog.addAccount.message': {
        fr: 'Ajouter un nouveau compte Outlook', en: 'Add a new Outlook account',
        es: 'Añadir una nueva cuenta de Outlook', de: 'Neues Outlook-Konto hinzufügen',
        it: 'Aggiungi un nuovo account Outlook', pt: 'Adicionar uma nova conta Outlook',
        zh: '添加新的 Outlook 账户', ar: 'إضافة حساب Outlook جديد',
    },
    'dialog.addAccount.detail': {
        fr: "Un nouveau compte sera ajouté avec l'URL Outlook par défaut. Vous devrez vous connecter séparément dans la nouvelle fenêtre.",
        en: 'A new account will be added with the default Outlook URL. You will need to sign in separately in the new window.',
        es: 'Se añadirá una nueva cuenta con la URL predeterminada de Outlook. Deberás iniciar sesión por separado en la nueva ventana.',
        de: 'Ein neues Konto mit der Standard-Outlook-URL wird hinzugefügt. Du musst dich separat im neuen Fenster anmelden.',
        it: 'Verrà aggiunto un nuovo account con l\'URL Outlook predefinito. Dovrai accedere separatamente nella nuova finestra.',
        pt: 'Uma nova conta será adicionada com o URL padrão do Outlook. Você precisará entrar separadamente na nova janela.',
        zh: '将添加一个使用默认 Outlook URL 的新账户。您需要在新窗口中单独登录。',
        ar: 'سيتم إضافة حساب جديد بعنوان Outlook الافتراضي. necesitarás iniciar sesión por separado en la nueva ventana.',
    },
    'dialog.addAccount.confirm': {
        fr: 'Ajouter', en: 'Add', es: 'Añadir', de: 'Hinzufügen',
        it: 'Aggiungi', pt: 'Adicionar', zh: '添加', ar: 'إضافة',
    },
    'dialog.removeAccount.title': {
        fr: 'Supprimer le compte', en: 'Remove account', es: 'Eliminar cuenta',
        de: 'Konto entfernen', it: 'Rimuovi account', pt: 'Remover conta',
        zh: '删除账户', ar: 'حذف الحساب',
    },
    'dialog.removeAccount.message': {
        fr: 'Supprimer le compte « {name} » ?', en: 'Remove account "{name}"?',
        es: '¿Eliminar la cuenta "{name}"?', de: 'Konto „{name}" entfernen?',
        it: 'Rimuovere l\'account "{name}"?', pt: 'Remover a conta "{name}"?',
        zh: '删除账户“{name}”？', ar: 'حذف الحساب "{name}"؟',
    },
    'dialog.removeAccount.detail': {
        fr: 'Les données de session de ce compte seront supprimées. Vous devrez vous reconnecter si vous le réajoutez plus tard.',
        en: 'Session data for this account will be deleted. You will need to sign in again if you re-add it later.',
        es: 'Los datos de sesión de esta cuenta serán eliminados. Deberás iniciar sesión de nuevo si la vuelves a añadir más tarde.',
        de: 'Sitzungsdaten für dieses Konto werden gelöscht. Du musst dich erneut anmelden, wenn du es später wieder hinzufügst.',
        it: 'I dati di sessione di questo account verranno eliminati. Dovrai accedere nuovamente se lo riaggiungi in seguito.',
        pt: 'Os dados de sessão desta conta serão eliminados. Terá de iniciar sessão novamente se a voltar a adicionar mais tarde.',
        zh: '此账户的会话数据将被删除。如果以后重新添加，您需要重新登录。',
        ar: 'سيتم حذف بيانات الجلسة لهذا الحساب. necesitarás تسجيل الدخول مرة أخرى إذا أعدت إضافته لاحقاً.',
    },
    'dialog.removeAccount.confirm': {
        fr: 'Supprimer', en: 'Remove', es: 'Eliminar', de: 'Entfernen',
        it: 'Rimuovi', pt: 'Remover', zh: '删除', ar: 'حذف',
    },
    'dialog.restore.title': {
        fr: 'Confirmer la restauration', en: 'Confirm Restore', es: 'Confirmar restauración',
        de: 'Wiederherstellung bestätigen', it: 'Conferma ripristino', pt: 'Confirmar restauração',
        zh: '确认恢复', ar: 'تأكيد الاستعادة',
    },
    'dialog.restore.message': {
        fr: 'Restaurer tous les paramètres par défaut ?', en: 'Restore all settings to default values?',
        es: '¿Restaurar todos los ajustes a los valores predeterminados?', de: 'Alle Einstellungen auf Standardwerte zurücksetzen?',
        it: 'Ripristinare tutte le impostazioni ai valori predefiniti?', pt: 'Restaurar todas as configurações para os valores padrão?',
        zh: '将所有设置恢复为默认值？', ar: 'استعادة جميع الإعدادات إلى القيم الافتراضية؟',
    },
    'dialog.restore.detail': {
        fr: 'Cela restaurera tous les paramètres à leurs valeurs par défaut mais conservera vos données.',
        en: 'This will restore all settings to their factory defaults but preserve your app data.',
        es: 'Esto restaurará todos los ajustes a sus valores predeterminados pero conservará tus datos.',
        de: 'Dadurch werden alle Einstellungen auf die Werkseinstellungen zurückgesetzt, deine App-Daten bleiben jedoch erhalten.',
        it: 'Questo ripristinerà tutte le impostazioni ai valori predefiniti ma preserverà i tuoi dati.',
        pt: 'Isto irá restaurar todas as configurações para os valores padrão, mas preservará os seus dados.',
        zh: '这将把所有设置恢复为出厂默认值，但保留您的应用数据。',
        ar: 'سيؤدي هذا إلى استعادة جميع الإعدادات إلى قيمها الافتراضية مع الحفاظ على بيانات التطبيق.',
    },
    'dialog.restore.confirm': {
        fr: 'Restaurer', en: 'Restore', es: 'Restaurar', de: 'Wiederherstellen',
        it: 'Ripristina', pt: 'Restaurar', zh: '恢复', ar: 'استعادة',
    },
    'dialog.reset.title': {
        fr: 'Confirmer la réinitialisation', en: 'Confirm Full Reset', es: 'Confirmar restablecimiento completo',
        de: 'Vollständiges Zurücksetzen bestätigen', it: 'Conferma ripristino completo', pt: 'Confirmar redefinição completa',
        zh: '确认完全重置', ar: 'تأكيد إعادة التعيين الكاملة',
    },
    'dialog.reset.message': {
        fr: 'Effacer TOUTES les données de l\'application ?', en: 'Clear ALL application data?',
        es: '¿Borrar TODOS los datos de la aplicación?', de: 'ALLE Anwendungsdaten löschen?',
        it: 'Cancellare TUTTI i dati dell\'applicazione?', pt: 'Limpar TODOS os dados do aplicativo?',
        zh: '清除所有应用数据？', ar: 'مسح جميع بيانات التطبيق؟',
    },
    'dialog.reset.detail': {
        fr: 'Cela supprimera définitivement :\n- Tous les paramètres\n- Les mails en cache\n- Les données locales\n\nVous devrez vous reconnecter.',
        en: 'This will permanently delete:\n- All settings\n- Cached emails\n- Local data\n\nYou will need to sign in again.',
        es: 'Esto eliminará permanentemente:\n- Todos los ajustes\n- Correos en caché\n- Datos locales\n\nTendrás que iniciar sesión de nuevo.',
        de: 'Dadurch werden dauerhaft gelöscht:\n- Alle Einstellungen\n- Zwischengespeicherte E-Mails\n- Lokale Daten\n\nDu musst dich erneut anmelden.',
        it: 'Questo eliminerà definitivamente:\n- Tutte le impostazioni\n- Email in cache\n- Dati locali\n\nDovrai accedere di nuovo.',
        pt: 'Isto eliminará permanentemente:\n- Todas as configurações\n- E-mails em cache\n- Dados locais\n\nTerá de iniciar sessão novamente.',
        zh: '这将永久删除：\n- 所有设置\n- 缓存的邮件\n- 本地数据\n\n您需要重新登录。',
        ar: 'سيحذف هذا نهائياً:\n- جميع الإعدادات\n- رسائل البريد المخزنة مؤقتاً\n- البيانات المحلية\n\nnecesitarás iniciar sesión de nuevo.',
    },
    'dialog.reset.confirm': {
        fr: 'Tout effacer', en: 'Reset Everything', es: 'Borrar todo', de: 'Alles löschen',
        it: 'Cancella tutto', pt: 'Limpar tudo', zh: '全部清除', ar: 'مسح الكل',
    },
    'dialog.reset.success.title': {
        fr: 'Réinitialisation terminée', en: 'Reset Complete', es: 'Restablecimiento completado',
        de: 'Zurücksetzen abgeschlossen', it: 'Ripristino completato', pt: 'Redefinição concluída',
        zh: '重置完成', ar: 'اكتمل إعادة التعيين',
    },
    'dialog.reset.success.message': {
        fr: 'Toutes les données ont été supprimées.', en: 'All app data has been deleted.',
        es: 'Todos los datos han sido eliminados.', de: 'Alle App-Daten wurden gelöscht.',
        it: 'Tutti i dati sono stati eliminati.', pt: 'Todos os dados foram eliminados.',
        zh: '所有应用数据已删除。', ar: 'تم حذف جميع بيانات التطبيق.',
    },
    'dialog.reset.success.detail': {
        fr: "L'application va maintenant se fermer.", en: 'The application will now close.',
        es: 'La aplicación se cerrará ahora.', de: 'Die Anwendung wird jetzt geschlossen.',
        it: "L'applicazione verrà chiusa.", pt: 'O aplicativo será fechado agora.',
        zh: '应用将关闭。', ar: 'سيتم إغلاق التطبيق الآن.',
    },

    // ===== Notifications =====
    'notif.newMessages.title': {
        fr: 'Nouveaux messages', en: 'New Messages', es: 'Nuevos mensajes',
        de: 'Neue Nachrichten', it: 'Nuovi messaggi', pt: 'Novas mensagens',
        zh: '新邮件', ar: 'رسائل جديدة',
    },
    'notif.newMessages.body': {
        fr: '{count} message(s) non lu(s)', en: '{count} unread message(s)', es: '{count} mensaje(s) sin leer',
        de: '{count} ungelesene Nachricht(en)', it: '{count} messaggio/i non letto/i', pt: '{count} mensagem(ns) não lida(s)',
        zh: '{count} 封未读邮件', ar: '{count} رسالة غير مقروءة',
    },
    'notif.newMail.title': {
        fr: 'Nouveau mail', en: 'New mail', es: 'Nuevo correo',
        de: 'Neue E-Mail', it: 'Nuova email', pt: 'Novo e-mail',
        zh: '新邮件', ar: 'بريد جديد',
    },
    'notif.newMail.body': {
        fr: '{sender} : {subject}', en: '{sender}: {subject}', es: '{sender}: {subject}',
        de: '{sender}: {subject}', it: '{sender}: {subject}', pt: '{sender}: {subject}',
        zh: '{sender}：{subject}', ar: '{sender}: {subject}',
    },
    'notif.newMail.bodyNoSubject': {
        fr: '{sender} (pas de sujet)', en: '{sender} (no subject)', es: '{sender} (sin asunto)',
        de: '{sender} (kein Betreff)', it: '{sender} (nessun oggetto)', pt: '{sender} (sem assunto)',
        zh: '{sender}（无主题）', ar: '{sender} (بدون موضوع)',
    },
    'notif.calendar.title': {
        fr: '{count} rappel(s) calendrier', en: '{count} Calendar Reminder(s)', es: '{count} recordatorio(s) de calendario',
        de: '{count} Kalendererinnerung(en)', it: '{count} promemoria calendario', pt: '{count} lembrete(s) de calendário',
        zh: '{count} 条日历提醒', ar: '{count} تذكير/تذكيرات تقويم',
    },
    'notif.offline.title': {
        fr: 'Connexion Internet perdue', en: 'Internet connection lost', es: 'Conexión a Internet perdida',
        de: 'Internetverbindung verloren', it: 'Connessione Internet persa', pt: 'Ligação à Internet perdida',
        zh: '互联网连接断开', ar: 'تم فقدان الاتصال بالإنترنت',
    },
    'notif.online.title': {
        fr: 'Connexion rétablie', en: 'Connection restored', es: 'Conexión restablecida',
        de: 'Verbindung wiederhergestellt', it: 'Connessione ripristinata', pt: 'Ligação restabelecida',
        zh: '连接已恢复', ar: 'تم استعادة الاتصال',
    },

    // ===== Splash =====
    'splash.loading': {
        fr: 'Chargement...', en: 'Loading...', es: 'Cargando...', de: 'Laden...',
        it: 'Caricamento...', pt: 'Carregando...', zh: '加载中...', ar: 'جارٍ التحميل...',
    },

    // ===== Offline page =====
    'offline.title': {
        fr: 'Pas de connexion', en: 'No connection', es: 'Sin conexión',
        de: 'Keine Verbindung', it: 'Nessuna connessione', pt: 'Sem ligação',
        zh: '无连接', ar: 'لا يوجد اتصال',
    },
    'offline.message': {
        fr: 'UToutlook Mail n\'arrive pas à se connecter. Vérifiez votre connexion Internet.',
        en: 'UToutlook Mail cannot connect. Check your Internet connection.',
        es: 'UToutlook Mail no puede conectarse. Comprueba tu conexión a Internet.',
        de: 'UToutlook Mail kann keine Verbindung herstellen. Überprüfe deine Internetverbindung.',
        it: 'UToutlook Mail non riesce a connettersi. Controlla la tua connessione Internet.',
        pt: 'UToutlook Mail não consegue ligar. Verifique a sua ligação à Internet.',
        zh: 'UToutlook Mail 无法连接。请检查您的互联网连接。',
        ar: 'لا يمكن لـ UToutlook Mail الاتصال. تحقق من اتصال الإنترنت الخاص بك.',
    },
    'offline.retry': {
        fr: 'Réessayer', en: 'Retry', es: 'Reintentar', de: 'Erneut versuchen',
        it: 'Riprova', pt: 'Tentar novamente', zh: '重试', ar: 'إعادة المحاولة',
    },
    'offline.checking': {
        fr: 'Vérification...', en: 'Checking...', es: 'Comprobando...', de: 'Prüfen...',
        it: 'Verifica...', pt: 'Verificando...', zh: '检查中...', ar: 'جارٍ الفحص...',
    },
    'offline.connected': {
        fr: 'Connexion retrouvée !', en: 'Connection restored!', es: '¡Conexión restablecida!',
        de: 'Verbindung wiederhergestellt!', it: 'Connessione ripristinata!', pt: 'Ligação restabelecida!',
        zh: '连接已恢复！', ar: 'تم استعادة الاتصال!',
    },
    'offline.autoReconnect': {
        fr: 'Reconnexion automatique...', en: 'Auto-reconnecting...', es: 'Reconexión automática...',
        de: 'Automatisch verbinden...', it: 'Riconnessione automatica...', pt: 'Reconectando automaticamente...',
        zh: '自动重连...', ar: 'إعادة الاتصال تلقائياً...',
    },

    // ===== About =====
    'about.description': {
        fr: 'Client mail Outlook pour Ubuntu Touch', en: 'Outlook mail client for Ubuntu Touch',
        es: 'Cliente de correo Outlook para Ubuntu Touch', de: 'Outlook-Mail-Client für Ubuntu Touch',
        it: 'Client di posta Outlook per Ubuntu Touch', pt: 'Cliente de e-mail Outlook para Ubuntu Touch',
        zh: 'Ubuntu Touch 版 Outlook 邮件客户端', ar: 'عميل بريد Outlook لـ Ubuntu Touch',
    },
    'about.tagline': {
        fr: 'Human made, vibe verified', en: 'Human made, vibe verified', es: 'Human made, vibe verified',
        de: 'Human made, vibe verified', it: 'Human made, vibe verified', pt: 'Human made, vibe verified',
        zh: 'Human made, vibe verified', ar: 'Human made, vibe verified',
    },
    'about.basedOn': {
        fr: 'Basé sur Prospect Mail (MIT) adapté pour UBports', en: 'Based on Prospect Mail (MIT) adapted for UBports',
        es: 'Basado en Prospect Mail (MIT) adaptado para UBports', de: 'Basierend auf Prospect Mail (MIT) für UBports angepasst',
        it: 'Basato su Prospect Mail (MIT) adattato per UBports', pt: 'Baseado no Prospect Mail (MIT) adaptado para UBports',
        zh: '基于 Prospect Mail (MIT) 适配 UBports', ar: 'مبني على Prospect Mail (MIT) معدّل لـ UBports',
    },
    'about.reportIssue': {
        fr: 'Signaler un problème', en: 'Report an issue', es: 'Informar de un problema',
        de: 'Problem melden', it: 'Segnala un problema', pt: 'Relatar um problema',
        zh: '报告问题', ar: 'الإبلاغ عن مشكلة',
    },

    // ===== Account defaults =====
    'account.default': {
        fr: 'Compte principal', en: 'Primary account', es: 'Cuenta principal',
        de: 'Hauptkonto', it: 'Account principale', pt: 'Conta principal',
        zh: '主账户', ar: 'الحساب الرئيسي',
    },
    'account.new': {
        fr: 'Compte {n}', en: 'Account {n}', es: 'Cuenta {n}',
        de: 'Konto {n}', it: 'Account {n}', pt: 'Conta {n}',
        zh: '账户 {n}', ar: 'حساب {n}',
    },

    // ===== Focus mode indicator =====
    'focus.indicator': {
        fr: 'Mode lecture', en: 'Focus mode', es: 'Modo lectura', de: 'Fokusmodus',
        it: 'Modalità lettura', pt: 'Modo leitura', zh: '专注模式', ar: 'وضع التركيز',
    },

    // ===== Context menu =====
    'ctx.undo': {
        fr: 'Annuler', en: 'Undo', es: 'Deshacer', de: 'Rückgängig',
        it: 'Annulla', pt: 'Desfazer', zh: '撤销', ar: 'تراجع',
    },
    'ctx.redo': {
        fr: 'Rétablir', en: 'Redo', es: 'Rehacer', de: 'Wiederholen',
        it: 'Ripeti', pt: 'Refazer', zh: '重做', ar: 'إعادة',
    },
    'ctx.cut': {
        fr: 'Couper', en: 'Cut', es: 'Cortar', de: 'Ausschneiden',
        it: 'Taglia', pt: 'Cortar', zh: '剪切', ar: 'قص',
    },
    'ctx.copy': {
        fr: 'Copier', en: 'Copy', es: 'Copiar', de: 'Kopieren',
        it: 'Copia', pt: 'Copiar', zh: '复制', ar: 'نسخ',
    },
    'ctx.paste': {
        fr: 'Coller', en: 'Paste', es: 'Pegar', de: 'Einfügen',
        it: 'Incolla', pt: 'Colar', zh: '粘贴', ar: 'لصق',
    },
    'ctx.selectAll': {
        fr: 'Tout sélectionner', en: 'Select All', es: 'Seleccionar todo',
        de: 'Alles auswählen', it: 'Seleziona tutto', pt: 'Selecionar tudo',
        zh: '全选', ar: 'تحديد الكل',
    },
    'ctx.openLink': {
        fr: 'Ouvrir le lien dans le navigateur', en: 'Open Link in Browser',
        es: 'Abrir enlace en el navegador', de: 'Link im Browser öffnen',
        it: 'Apri link nel browser', pt: 'Abrir link no navegador',
        zh: '在浏览器中打开链接', ar: 'فتح الرابط في المتصفح',
    },
    'ctx.copyLink': {
        fr: "Copier l'adresse du lien", en: 'Copy Link Address',
        es: 'Copiar dirección del enlace', de: 'Linkadresse kopieren',
        it: 'Copia indirizzo link', pt: 'Copiar endereço do link',
        zh: '复制链接地址', ar: 'نسخ عنوان الرابط',
    },
    'ctx.inspect': {
        fr: "Inspecter l'élément", en: 'Inspect Element',
        es: 'Inspeccionar elemento', de: 'Element untersuchen',
        it: 'Ispeziona elemento', pt: 'Inspecionar elemento',
        zh: '检查元素', ar: 'فحص العنصر',
    },

    // ===== Shell notifications =====
    'shell.welcome': {
        fr: 'Bienvenue dans UToutlook Mail', en: 'Welcome to UToutlook Mail',
        es: 'Bienvenido a UToutlook Mail', de: 'Willkommen bei UToutlook Mail',
        it: 'Benvenuto in UToutlook Mail', pt: 'Bem-vindo ao UToutlook Mail',
        zh: '欢迎使用 UToutlook Mail', ar: 'مرحباً بك في UToutlook Mail',
    },
    'shell.waitClose': {
        fr: 'Veuillez attendre la fermeture d\'UToutlook', en: 'Please wait for UToutlook to close',
        es: 'Espera a que UToutlook se cierre', de: 'Bitte warte, bis UToutlook geschlossen wird',
        it: 'Attendi la chiusura di UToutlook', pt: 'Aguarde o fecho do UToutlook',
        zh: '请等待 UToutlook 关闭', ar: 'الرجاء الانتظار حتى يغلق UToutlook',
    },
    'shell.cleaning': {
        fr: 'Nettoyage d\'UToutlook Mail', en: 'Cleaning UToutlook Mail',
        es: 'Limpiando UToutlook Mail', de: 'UToutlook Mail wird bereinigt',
        it: 'Pulizia di UToutlook Mail', pt: 'Limpando UToutlook Mail',
        zh: '正在清理 UToutlook Mail', ar: 'جارٍ تنظيف UToutlook Mail',
    },
    'shell.noNetwork': {
        fr: 'Pas d\'accès réseau... fermeture', en: 'No network access... quitting',
        es: 'Sin acceso a la red... cerrando', de: 'Kein Netzwerkzugriff... wird beendet',
        it: 'Nessun accesso di rete... chiusura', pt: 'Sem acesso à rede... a encerrar',
        zh: '无网络访问...正在退出', ar: 'لا يوجد وصول للشبكة... جارٍ الخروج',
    },
    'shell.goodbye': {
        fr: 'Au revoir UToutlook Mail !', en: 'Goodbye UToutlook Mail!',
        es: '¡Adiós UToutlook Mail!', de: 'Auf Wiedersehen UToutlook Mail!',
        it: 'Arrivederci UToutlook Mail!', pt: 'Adeus UToutlook Mail!',
        zh: '再见 UToutlook Mail！', ar: 'وداعاً UToutlook Mail!',
    },
    'shell.resetDone': {
        fr: 'Réinitialisation effectuée... lancez UToutlook Mail', en: 'Reset done... launch UToutlook Mail',
        es: 'Restablecimiento hecho... inicia UToutlook Mail', de: 'Zurücksetzen erledigt... starte UToutlook Mail',
        it: 'Ripristino completato... avvia UToutlook Mail', pt: 'Redefinição concluída... inicie o UToutlook Mail',
        zh: '重置完成...请启动 UToutlook Mail', ar: 'اكتمل إعادة التعيين... شغّل UToutlook Mail',
    },
};

// --- Current language ---
let currentLang = DEFAULT_LANG;

/**
 * Set the current language.
 * @param {string} lang - Language code (fr, en, es, de, it, pt, zh, ar)
 */
export function setLanguage(lang) {
    if (LANGUAGES[lang]) {
        currentLang = lang;
    } else {
        logger.warn(`Unknown language: ${lang}, falling back to ${DEFAULT_LANG}`);
        currentLang = DEFAULT_LANG;
    }
}

/**
 * Get the current language code.
 * @returns {string}
 */
export function getLanguage() {
    return currentLang;
}

/**
 * Get available languages.
 * @returns {Object} Map of lang code → display name
 */
export function getAvailableLanguages() {
    return {...LANGUAGES};
}

/**
 * Translate a key with optional variable interpolation.
 * @param {string} key - Translation key (e.g. 'tray.quit')
 * @param {Object} [vars] - Variables for interpolation (e.g. { count: 5, name: 'John' })
 * @returns {string} Translated string, or the key itself if not found
 */
export function t(key, vars = {}) {
    const entry = T[key];
    if (!entry) {
        logger.warn(`Missing translation key: ${key}`);
        return key;
    }
    let str = entry[currentLang] || entry[DEFAULT_LANG] || key;
    // Interpolate {var} placeholders
    for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    return str;
}

/**
 * Get all translations for the current language (flat map).
 * Useful for passing to renderer processes or HTML pages.
 * @returns {Object} Flat map of key → translated string
 */
export function getAllTranslations() {
    const result = {};
    for (const key of Object.keys(T)) {
        result[key] = t(key);
    }
    return result;
}

/**
 * Detect the best language from a locale string (e.g. 'fr_FR.UTF-8' → 'fr').
 * @param {string} locale - Locale string
 * @returns {string} Language code
 */
export function detectLanguage(locale) {
    if (!locale) return DEFAULT_LANG;
    const code = locale.toLowerCase().split(/[_.-]/)[0];
    return LANGUAGES[code] ? code : DEFAULT_LANG;
}

export default { t, setLanguage, getLanguage, getAvailableLanguages, getAllTranslations, detectLanguage, LANGUAGES };
