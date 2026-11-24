// ============================================================
// i18n.mjs — Internationalisation for UToutlook Mail
//
// Supported languages (10): fr (default), en, es, de, it, pt, zh, ar, ca, eu
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
    ca: 'Català',
    eu: 'Euskara',
};

const DEFAULT_LANG = 'fr';

// --- Translations ---
const T = {
    // ===== Common =====
    // ===== Login page badge (v3.3.50) =====
    'login.madeFor': {
        fr: 'Made for Ubtouch', en: 'Made for Ubtouch', es: 'Made for Ubtouch', de: 'Made for Ubtouch',
        it: 'Made for Ubtouch', pt: 'Made for Ubtouch', zh: 'Made for Ubtouch', ar: 'Made for Ubtouch',
        ca: 'Made for Ubtouch', eu: 'Made for Ubtouch',
    },
    // ===== Login page first-install button (v3.3.63) =====
    'login.firstInstall': {
        fr: 'Première installation', en: 'First install', es: 'Primera instalación', de: 'Erste Installation',
        it: 'Prima installazione', pt: 'Primeira instalação', zh: '首次安装', ar: 'التثبيت الأول',
        ca: 'Primera instal·lació', eu: 'Lehenengo instalazioa',
    },
    'login.firstInstallConfirm': {
        fr: 'Effacer les données de connexion et recommencer à zéro ?', en: 'Clear sign-in data and start fresh?',
        es: '¿Borrar los datos de inicio de sesión y empezar de cero?', de: 'Anmeldedaten löschen und neu beginnen?',
        it: 'Cancellare i dati di accesso e ricominciare da capo?', pt: 'Apagar os dados de login e começar do zero?',
        zh: '清除登录数据并重新开始？', ar: 'مسح بيانات تسجيل الدخول والبدء من جديد؟',
        ca: 'Vols esborrar les dades d’inici de sessió i començar de nou?', eu: 'Saio-hasierako datuak ezabatu eta berriro hasi nahi al duzu?',
    },
    'login.firstInstallConfirmAction': {
        fr: 'Tout effacer', en: 'Wipe everything', es: 'Borrar todo', de: 'Alles löschen',
        it: 'Cancella tutto', pt: 'Apagar tudo', zh: '全部清除', ar: 'مسح الكل',
        ca: 'Esborra-ho tot', eu: 'Ezabatu guztia',
    },
    'app.name': {
        fr: 'UToutlook Mail', en: 'UToutlook Mail', es: 'UToutlook Mail', de: 'UToutlook Mail',
        it: 'UToutlook Mail', pt: 'UToutlook Mail', zh: 'UToutlook Mail', ar: 'UToutlook Mail',
        ca: 'UToutlook Mail', eu: 'UToutlook Mail',
    },
    'common.loading': {
        fr: 'Chargement...', en: 'Loading...', es: 'Cargando...', de: 'Laden...',
        it: 'Caricamento...', pt: 'Carregando...', zh: '加载中...', ar: 'جارٍ التحميل...',
        ca: 'Carregant...', eu: 'Kargatzen...',
    },
    // v4.0.40: voile blanc « veuillez patienter » pendant le resync d'une boucle 2FA
    'resync.pleaseWait': {
        fr: 'Veuillez patienter...', en: 'Please wait...', es: 'Espera...', de: 'Bitte warten...',
        it: 'Attendi...', pt: 'Aguarde...', zh: '请稍候...', ar: 'الرجاء الانتظار...',
        ca: 'Espereu…', eu: 'Itxaron mesedez ...',
    },
    // v4.0.76: toast affiché quand un changement d'orientation est détecté
    // v4.0.84: précise que l'application va être relancée après le pivot
    'overlay.rotation': {
        fr: 'Rotation détectée, relance de l\'application…', en: 'Rotation detected, relaunching app…', es: 'Rotación detectada, reiniciando la app…', de: 'Rotation erkannt, App wird neu gestartet…',
        it: 'Rotazione rilevata, riavvio dell\'app…', pt: 'Rotação detetada, a reiniciar a app…', zh: '检测到旋转，正在重启应用…', ar: 'تم اكتشاف الدوران، جارٍ إعادة تشغيل التطبيق…',
        ca: 'S’ha detectat una rotació. S’està tornant a iniciar l’aplicació…', eu: 'Biraketa hauteman da, aplikazioa berriro abiarazten...',
    },
    // v4.0.87: titre de la notification système envoyée à la relance après rotation
    'overlay.rotationNotifyTitle': {
        fr: 'UtOutlook', en: 'UtOutlook', es: 'UtOutlook', de: 'UtOutlook',
        it: 'UtOutlook', pt: 'UtOutlook', zh: 'UtOutlook', ar: 'UtOutlook',
        ca: 'UtOutlook', eu: 'UtOutlook',
    },
    // v4.0.78: avertissement avant le reload automatique d'une liste vide
    'overlay.listEmptyReload': {
        fr: 'Liste vide — rechargement de la page…', en: 'Empty list — reloading page…', es: 'Lista vacía — recargando…', de: 'Liste leer — Seite wird neu geladen…',
        it: 'Elenco vuoto — ricaricamento…', pt: 'Lista vazia — recarregando…', zh: '列表为空 — 正在重新加载…', ar: 'القائمة فارغة — جارٍ إعادة التحميل…',
        ca: 'Llista buida: s\'està tornant a carregar la pàgina…', eu: 'Zerrenda hutsik — orria berriro kargatzen…',
    },
    // v4.0.95: bouton « recharger les messages » en bas de la liste (rechargement manuel)
    'overlay.reloadMessages': {
        fr: 'Recharger les messages', en: 'Reload messages', es: 'Recargar mensajes', de: 'Nachrichten neu laden',
        it: 'Ricarica messaggi', pt: 'Recarregar mensagens', zh: '重新加载邮件', ar: 'إعادة تحميل الرسائل',
        ca: 'Torna a carregar els missatges', eu: 'Kargatu berriro mezuak',
    },
    // v4.0.95: toast affiché pendant le rechargement manuel déclenché par le bouton
    'overlay.reloading': {
        fr: 'Rechargement…', en: 'Reloading…', es: 'Recargando…', de: 'Wird neu geladen…',
        it: 'Ricaricamento…', pt: 'A recarregar…', zh: '正在重新加载…', ar: 'جارٍ إعادة التحميل…',
        ca: 'Torneu a carregar!', eu: 'Berrekartzen…',
    },
    'common.cancel': {
        fr: 'Annuler', en: 'Cancel', es: 'Cancelar', de: 'Abbrechen',
        it: 'Annulla', pt: 'Cancelar', zh: '取消', ar: 'إلغاء',
        ca: 'Cancel·la', eu: 'Utzi',
    },
    'common.ok': {
        fr: 'OK', en: 'OK', es: 'OK', de: 'OK',
        it: 'OK', pt: 'OK', zh: '确定', ar: 'حسناً',
        ca: 'D\'acord', eu: 'Ados',
    },
    'common.quit': {
        fr: 'Quitter', en: 'Quit', es: 'Salir', de: 'Beenden',
        it: 'Esci', pt: 'Sair', zh: '退出', ar: 'خروج',
        ca: 'Surt', eu: 'Irten',
    },
    // v4.1.3: bouton « Première installation » dans la barre d'actions de la liste
    'action.firstInstall': {
        fr: 'Première installation', en: 'First install', es: 'Primera instalación', de: 'Erste Installation',
        it: 'Prima installazione', pt: 'Primeira instalação', zh: '首次安装', ar: 'التثبيت الأول',
        ca: 'Primera instal·lació', eu: 'Lehenengo instalazioa',
    },
    // v4.1.3: confirmation en page (double-tap) avant le wipe complet
    'action.firstInstallConfirm': {
        fr: 'Tout effacer ?', en: 'Wipe everything?', es: '¿Borrar todo?', de: 'Alles löschen?',
        it: 'Cancella tutto?', pt: 'Apagar tudo?', zh: '全部清除？', ar: 'مسح الكل؟',
        ca: 'Vols esborrar-ho tot?', eu: 'Dena ezabatu?',
    },
    // v4.1.3: notification affichée après le wipe, avant la relance
    'action.firstInstallNotify': {
        fr: 'Données effacées — redémarrage…', en: 'Data cleared — restarting…', es: 'Datos borrados — reiniciando…', de: 'Daten gelöscht — Neustart…',
        it: 'Dati cancellati — riavvio…', pt: 'Dados apagados — reiniciando…', zh: '数据已清除 — 正在重启…', ar: 'تم مسح البيانات — جارٍ إعادة التشغيل…',
        ca: 'S’han esborrat les dades. S’està reiniciant…', eu: 'Datuak ezabatu dira — berrabiaratzen…',
    },
    // v4.3.7: bouton diagnostics + message apres generation du rapport
    'action.diagnostics': {
        fr: 'Diagnostics', en: 'Diagnostics', es: 'Diagnóstico', de: 'Diagnose',
        it: 'Diagnostica', pt: 'Diagnóstico', zh: 'Diagnostics', ar: 'التشخيص',
        ca: 'Diagnòstic', eu: 'Diagnostikoa',
    },
    'diagnostics.saved': {
        fr: 'Rapport enregistré : {path}', en: 'Report saved to: {path}',
        es: 'Informe guardado en: {path}', de: 'Bericht gespeichert unter: {path}',
        it: 'Report salvato in: {path}', pt: 'Relatório guardado em: {path}',
        zh: 'Report saved to: {path}', ar: 'تم حفظ التقرير في: {path}',
        ca: 'Informe desat al directori: {path}', eu: 'Txostena gorde da: {path}',
    },
    'common.show': {
        fr: 'Afficher', en: 'Show', es: 'Mostrar', de: 'Anzeigen',
        it: 'Mostra', pt: 'Mostrar', zh: '显示', ar: 'إظهار',
        ca: 'Mostra', eu: 'Erakutsi',
    },
    // v4.4.5: feuille Parametres (reglages retires de la barre d'actions)
    'settings.title': {
        fr: 'Paramètres', en: 'Settings', es: 'Ajustes', de: 'Einstellungen',
        it: 'Impostazioni', pt: 'Configurações', zh: '设置', ar: 'الإعدادات',
        ca: 'Paràmetres', eu: 'Ezpennak',
    },
    'settings.display': {
        fr: 'Affichage', en: 'Display', es: 'Pantalla', de: 'Anzeige',
        it: 'Visualizzazione', pt: 'Exibição', zh: '显示', ar: 'العرض',
        ca: 'Pantalla', eu: 'Bistaratzea',
    },
    'settings.renderAuto': {
        fr: 'Automatique', en: 'Automatic', es: 'Automático', de: 'Automatisch',
        it: 'Automatico', pt: 'Automático', zh: '自动', ar: 'تلقائي',
        ca: 'Automàtic', eu: 'Automatikoa',
    },
    'settings.renderSoftware': {
        fr: 'Logiciel', en: 'Software', es: 'Software', de: 'Software',
        it: 'Software', pt: 'Software', zh: '软件', ar: 'برمجي',
        ca: 'Programari', eu: 'Software',
    },
    'settings.renderHardware': {
        fr: 'Matériel', en: 'Hardware', es: 'Hardware', de: 'Hardware',
        it: 'Hardware', pt: 'Hardware', zh: '硬件', ar: 'عتادي',
        ca: 'Maquinari', eu: 'Hardwarea',
    },
    'common.close': {
        fr: 'Fermer', en: 'Close', es: 'Cerrar', de: 'Schließen',
        it: 'Chiudi', pt: 'Fechar', zh: '关闭', ar: 'إغلاق',
        ca: 'Tanca', eu: 'Itxi',
    },
    'common.unavailable': {
        fr: 'Action indisponible', en: 'Action unavailable', es: 'Acción no disponible', de: 'Aktion nicht verfügbar',
        it: 'Azione non disponibile', pt: 'Ação indisponível', zh: '操作不可用', ar: 'إجراء غير متاح',
        ca: 'Acció no disponible', eu: 'Ekintza erabilgarri ez dago',
    },
    // v4.0.127: override du rendu logiciel (bouton page de login)
    'render.enable': {
        fr: 'Activer le rendu logiciel', en: 'Enable software rendering',
        es: 'Activar renderizado por software', de: 'Software-Rendering aktivieren',
        it: 'Attiva rendering software', pt: 'Ativar renderização por software',
        zh: '启用软件渲染', ar: 'تفعيل العرض البرمجي',
        ca: 'Activa el renderitzat de programari', eu: 'Gaitu software bidezko errendatzea',
    },
    'render.disable': {
        fr: 'Désactiver le rendu logiciel', en: 'Disable software rendering',
        es: 'Desactivar renderizado por software', de: 'Software-Rendering deaktivieren',
        it: 'Disattiva rendering software', pt: 'Desativar renderização por software',
        zh: '禁用软件渲染', ar: 'تعطيل العرض البرمجي',
        ca: 'Desactiva el renderitzat de programari', eu: 'Desgaitu software bidezko errendatzea',
    },
    // v4.4: transfert de pièces jointes via Content Hub (10 langues)
    'action.attachFile': {
        fr: 'Joindre un fichier', en: 'Attach a file', es: 'Adjuntar un archivo',
        de: 'Datei anhängen', it: 'Allega un file', pt: 'Anexar um arquivo',
        zh: '附加文件', ar: 'إرفاق ملف',
        ca: 'Adjuntar un fitxer', eu: 'Erantsi fitxategia',
    },
    'contentHub.failed': {
        fr: 'Impossible de joindre le fichier', en: 'Could not attach the file',
        es: 'No se pudo adjuntar el archivo', de: 'Datei konnte nicht angehängt werden',
        it: 'Impossibile allegare il file', pt: 'Não foi possível anexar o arquivo',
        zh: '无法附加文件', ar: 'تعذر إرفاق الملف',
        ca: 'No s’ha pogut adjuntar el fitxer', eu: 'Ezin izan da fitxategia erantsi',
    },
    'common.reload': {
        fr: 'Recharger', en: 'Reload', es: 'Recargar', de: 'Neu laden',
        it: 'Ricarica', pt: 'Recarregar', zh: '重新加载', ar: 'إعادة تحميل',
        ca: 'Recarrega', eu: 'Birkargatu',
    },
    'common.settings': {
        fr: 'Paramètres', en: 'Settings', es: 'Ajustes', de: 'Einstellungen',
        it: 'Impostazioni', pt: 'Configurações', zh: '设置', ar: 'الإعدادات',
        ca: 'Paràmetres', eu: 'Ezarpenak',
    },

    // ===== Tray menu =====
    'tray.show': {
        fr: 'Afficher', en: 'Show', es: 'Mostrar', de: 'Anzeigen',
        it: 'Mostra', pt: 'Mostrar', zh: '显示', ar: 'إظهار',
        ca: 'Mostra', eu: 'Erakutsi',
    },
    'tray.reload': {
        fr: 'Recharger', en: 'Reload', es: 'Recargar', de: 'Neu laden',
        it: 'Ricarica', pt: 'Recarregar', zh: '重新加载', ar: 'إعادة تحميل',
        ca: 'Recarrega', eu: 'Birkargatu',
    },
    'tray.accounts': {
        fr: 'Comptes', en: 'Accounts', es: 'Cuentas', de: 'Konten',
        it: 'Account', pt: 'Contas', zh: '账户', ar: 'الحسابات',
        ca: 'Comptes', eu: 'Kontuak',
    },
    'tray.settings': {
        fr: 'Paramètres', en: 'Settings', es: 'Ajustes', de: 'Einstellungen',
        it: 'Impostazioni', pt: 'Configurações', zh: '设置', ar: 'الإعدادات',
        ca: 'Paràmetres', eu: 'Ezarpenak',
    },
    'tray.quit': {
        fr: 'Quitter', en: 'Quit', es: 'Salir', de: 'Beenden',
        it: 'Esci', pt: 'Sair', zh: '退出', ar: 'خروج',
        ca: 'Surt', eu: 'Irten',
    },
    'tray.about': {
        fr: 'À propos de UToutlook Mail', en: 'About UToutlook Mail', es: 'Acerca de UToutlook Mail',
        de: 'Über UToutlook Mail', it: 'Informazioni su UToutlook Mail', pt: 'Sobre o UToutlook Mail',
        zh: '关于 UToutlook Mail', ar: 'حول UToutlook Mail',
        ca: 'Quant a UToutlook Mail', eu: 'UToutlook Mail-i buruz',
    },
    'tray.addAccount': {
        fr: '+ Ajouter un compte', en: '+ Add account', es: '+ Añadir cuenta', de: '+ Konto hinzufügen',
        it: '+ Aggiungi account', pt: '+ Adicionar conta', zh: '+ 添加账户', ar: '+ إضافة حساب',
        ca: '+ Afegir compte', eu: 'Gehitu Kontua',
    },
    'tray.removeAccount': {
        fr: '− Supprimer un compte', en: '− Remove account', es: '− Eliminar cuenta',
        de: '− Konto entfernen', it: '− Rimuovi account', pt: '− Remover conta',
        zh: '− 删除账户', ar: '− حذف حساب',
        ca: '− Elimina el compte', eu: 'Kendu kontua',
    },
    'tray.startMinimized': {
        fr: 'Démarrer minimisé', en: 'Start Minimized', es: 'Iniciar minimizado',
        de: 'Minimiert starten', it: 'Avvia ridotto', pt: 'Iniciar minimizado',
        zh: '最小化启动', ar: 'بدء مصغراً',
        ca: 'Inicia minimitzat', eu: 'Hasi txikituta',
    },
    'tray.hideOnClose': {
        fr: 'Masquer à la fermeture', en: 'Hide on Close', es: 'Ocultar al cerrar',
        de: 'Beim Schließen ausblenden', it: 'Nascondi alla chiusura', pt: 'Ocultar ao fechar',
        zh: '关闭时隐藏', ar: 'إخفاء عند الإغلاق',
        ca: 'Amaga en tancar', eu: 'Ezkutatu Itxi denean',
    },
    'tray.hideOnMinimize': {
        fr: 'Masquer à la réduction', en: 'Hide on Minimize', es: 'Ocultar al minimizar',
        de: 'Beim Minimieren ausblenden', it: 'Nascondi al ridotto', pt: 'Ocultar ao minimizar',
        zh: '最小化时隐藏', ar: 'إخفاء عند التصغير',
        ca: 'Amaga en minimitzar', eu: 'Ezkutatu minimizatzean',
    },
    'tray.showWindowFrame': {
        fr: 'Afficher le cadre de fenêtre', en: 'Show Window Frame', es: 'Mostrar marco de ventana',
        de: 'Fensterrahmen anzeigen', it: 'Mostra cornice finestra', pt: 'Mostrar moldura da janela',
        zh: '显示窗口边框', ar: 'إظهار إطار النافذة',
        ca: 'Mostra el marc de la finestra', eu: 'Leiho Uztaia',
    },
    'tray.focusMode': {
        fr: 'Mode lecture concentrée', en: 'Focus mode', es: 'Modo concentración',
        de: 'Fokusmodus', it: 'Modalità concentrazione', pt: 'Modo foco',
        zh: '专注模式', ar: 'وضع التركيز',
        ca: 'Mode de concentració', eu: 'Lasterbideen zerrendaren modua.',
    },
    'tray.darkMode': {
        fr: 'Mode sombre', en: 'Dark mode', es: 'Modo oscuro', de: 'Dunkelmodus',
        it: 'Modalità scura', pt: 'Modo escuro', zh: '深色模式', ar: 'الوضع الداكن',
        ca: 'Mode fosc', eu: 'Modu iluna',
    },
    'tray.language.auto': {
        fr: 'Auto (système)', en: 'Auto (system)', es: 'Auto (sistema)',
        de: 'Auto (System)', it: 'Auto (sistema)', pt: 'Auto (sistema)',
        zh: '自动（系统）', ar: 'تلقائي (النظام)',
        ca: 'Automàtic (sistema)', eu: 'Automatikoa (sistema)',
    },
    'tray.darkMode.auto': {
        fr: 'Auto (système)', en: 'Auto (system)', es: 'Auto (sistema)',
        de: 'Auto (System)', it: 'Auto (sistema)', pt: 'Auto (sistema)',
        zh: '自动（系统）', ar: 'تلقائي (النظام)',
        ca: 'Automàtic (sistema)', eu: 'Automatikoa (sistema)',
    },
    'tray.darkMode.on': {
        fr: 'Toujours activé', en: 'Always on', es: 'Siempre activado',
        de: 'Immer an', it: 'Sempre attivo', pt: 'Sempre ligado',
        zh: '始终开启', ar: 'دائماً مفعّل',
        ca: 'Sempre activat', eu: 'Beti gaiturik',
    },
    'tray.darkMode.off': {
        fr: 'Toujours désactivé', en: 'Always off', es: 'Siempre desactivado',
        de: 'Immer aus', it: 'Sempre spento', pt: 'Sempre desligado',
        zh: '始终关闭', ar: 'دائماً معطّل',
        ca: 'Sempre apagat', eu: 'Beti desgaituta',
    },
    'tray.accentColor': {
        fr: "Couleur d'accent", en: 'Accent color', es: 'Color de acento',
        de: 'Akzentfarbe', it: 'Colore accento', pt: 'Cor de destaque',
        zh: '强调色', ar: 'لون التمييز',
        ca: 'Color d\'èmfasi', eu: 'Azentu-kolorea',
    },
    'tray.language': {
        fr: 'Langue', en: 'Language', es: 'Idioma', de: 'Sprache',
        it: 'Lingua', pt: 'Idioma', zh: '语言', ar: 'اللغة',
        ca: 'Llengua', eu: 'Hizkuntza',
    },
    'tray.exportSettings': {
        fr: 'Exporter les paramètres', en: 'Export settings', es: 'Exportar ajustes',
        de: 'Einstellungen exportieren', it: 'Esporta impostazioni', pt: 'Exportar configurações',
        zh: '导出设置', ar: 'تصدير الإعدادات',
        ca: 'Exporteu els ajustos', eu: 'Esportatu ezarpenak',
    },
    'tray.importSettings': {
        fr: 'Importer les paramètres', en: 'Import settings', es: 'Importar ajustes',
        de: 'Einstellungen importieren', it: 'Importa impostazioni', pt: 'Importar configurações',
        zh: '导入设置', ar: 'استيراد الإعدادات',
        ca: 'Importeu els ajustos', eu: 'Inportatu ezarpenak',
    },
    'tray.showSettingsFile': {
        fr: 'Afficher le fichier de paramètres', en: 'Show settings file', es: 'Mostrar archivo de ajustes',
        de: 'Einstellungsdatei anzeigen', it: 'Mostra file impostazioni', pt: 'Mostrar arquivo de configurações',
        zh: '显示设置文件', ar: 'إظهار ملف الإعدادات',
        ca: 'Mostra el fitxer de configuració', eu: 'Erakutsi ezarpenak',
    },
    'tray.restoreDefaults': {
        fr: 'Restaurer les paramètres par défaut', en: 'Restore Default Settings', es: 'Restaurar ajustes predeterminados',
        de: 'Standardeinstellungen wiederherstellen', it: 'Ripristina impostazioni predefinite', pt: 'Restaurar configurações padrão',
        zh: '恢复默认设置', ar: 'استعادة الإعدادات الافتراضية',
        ca: 'Restaura la configuració predeterminada', eu: 'Lehenetsitako ezarpenak berrezarri',
    },
    'tray.resetAppData': {
        fr: "Réinitialiser les données de l'application", en: 'Reset Application Data', es: 'Restablecer datos de la aplicación',
        de: 'Anwendungsdaten zurücksetzen', it: 'Reimposta dati applicazione', pt: 'Redefinir dados do aplicativo',
        zh: '重置应用数据', ar: 'إعادة تعيين بيانات التطبيق',
        ca: 'Reinicia les dades de l’aplicació', eu: 'Berrezarri aplikazioaren datuak',
    },

    // ===== Colors =====
    'color.blue': {
        fr: 'Bleu Outlook (défaut)', en: 'Outlook Blue (default)', es: 'Azul Outlook (predeterminado)',
        de: 'Outlook-Blau (Standard)', it: 'Blu Outlook (predefinito)', pt: 'Azul Outlook (padrão)',
        zh: 'Outlook 蓝（默认）', ar: 'أزرق Outlook (افتراضي)',
        ca: 'Blau Outlook (per defecte)', eu: 'Outlook Urdina (lehenetsia)',
    },
    'color.green': {
        fr: 'Vert', en: 'Green', es: 'Verde', de: 'Grün',
        it: 'Verde', pt: 'Verde', zh: '绿色', ar: 'أخضر',
        ca: 'Verd', eu: 'Orlegia',
    },
    'color.purple': {
        fr: 'Violet', en: 'Purple', es: 'Morado', de: 'Lila',
        it: 'Viola', pt: 'Roxo', zh: '紫色', ar: 'بنفسجي',
        ca: 'Lila', eu: 'Purpura',
    },
    'color.pink': {
        fr: 'Rose', en: 'Pink', es: 'Rosa', de: 'Rosa',
        it: 'Rosa', pt: 'Rosa', zh: '粉色', ar: 'وردي',
        ca: 'Rosa', eu: 'Arrosa kolore',
    },
    'color.orange': {
        fr: 'Orange', en: 'Orange', es: 'Naranja', de: 'Orange',
        it: 'Arancione', pt: 'Laranja', zh: '橙色', ar: 'برتقالي',
        ca: 'Taronja', eu: 'Laranja',
    },
    'color.red': {
        fr: 'Rouge', en: 'Red', es: 'Rojo', de: 'Rot',
        it: 'Rosso', pt: 'Vermelho', zh: '红色', ar: 'أحمر',
        ca: 'Vermell', eu: 'Gorria',
    },
    'color.turquoise': {
        fr: 'Turquoise', en: 'Turquoise', es: 'Turquesa', de: 'Türkis',
        it: 'Turchese', pt: 'Turquesa', zh: '青绿色', ar: 'فيروزي',
        ca: 'Turquesa', eu: 'Turkesa',
    },

    // ===== Dialogs =====
    'dialog.export.title': {
        fr: 'Exporter les paramètres', en: 'Export settings', es: 'Exportar ajustes',
        de: 'Einstellungen exportieren', it: 'Esporta impostazioni', pt: 'Exportar configurações',
        zh: '导出设置', ar: 'تصدير الإعدادات',
        ca: 'Exporteu els ajustos', eu: 'Esportatu ezarpenak',
    },
    'dialog.export.success.title': {
        fr: 'Export réussi', en: 'Export successful', es: 'Exportación exitosa',
        de: 'Export erfolgreich', it: 'Esportazione riuscita', pt: 'Exportação bem-sucedida',
        zh: '导出成功', ar: 'تم التصدير بنجاح',
        ca: 'L’exportació s’ha realitzat correctament', eu: 'Ongi esportatu da',
    },
    'dialog.export.success.message': {
        fr: 'Paramètres exportés.', en: 'Settings exported.', es: 'Ajustes exportados.',
        de: 'Einstellungen exportiert.', it: 'Impostazioni esportate.', pt: 'Configurações exportadas.',
        zh: '设置已导出。', ar: 'تم تصدير الإعدادات.',
        ca: 'S’han exportat els ajustos.', eu: 'Ezarpenak esportatu dira.',
    },
    'dialog.export.success.detail': {
        fr: 'Fichier : {path}', en: 'File: {path}', es: 'Archivo: {path}',
        de: 'Datei: {path}', it: 'File: {path}', pt: 'Arquivo: {path}',
        zh: '文件：{path}', ar: 'الملف: {path}',
        ca: 'Fitxer: {path}', eu: 'Fitxategia: {path}',
    },
    'dialog.export.error': {
        fr: 'Export échoué', en: 'Export failed', es: 'Error al exportar',
        de: 'Export fehlgeschlagen', it: 'Esportazione fallita', pt: 'Falha na exportação',
        zh: '导出失败', ar: 'فشل التصدير',
        ca: 'L\' exportació ha fallat.', eu: 'Huts egin du esportatzean',
    },
    'dialog.import.title': {
        fr: 'Importer les paramètres', en: 'Import settings', es: 'Importar ajustes',
        de: 'Einstellungen importieren', it: 'Importa impostazioni', pt: 'Importar configurações',
        zh: '导入设置', ar: 'استيراد الإعدادات',
        ca: 'Importeu els ajustos', eu: 'Inportatu ezarpenak',
    },
    'dialog.import.success.title': {
        fr: 'Import réussi', en: 'Import successful', es: 'Importación exitosa',
        de: 'Import erfolgreich', it: 'Importazione riuscita', pt: 'Importação bem-sucedida',
        zh: '导入成功', ar: 'تم الاستيراد بنجاح',
        ca: 'S’ha importat correctament', eu: 'Inportatze arrakastatsua',
    },
    'dialog.import.success.message': {
        fr: 'Paramètres importés. Redémarrage recommandé.', en: 'Settings imported. Restart recommended.',
        es: 'Ajustes importados. Reinicio recomendado.', de: 'Einstellungen importiert. Neustart empfohlen.',
        it: 'Impostazioni importate. Riavvio consigliato.', pt: 'Configurações importadas. Reinício recomendado.',
        zh: '设置已导入。建议重启。', ar: 'تم استيراد الإعدادات. يوصى بإعادة التشغيل.',
        ca: 'S\'han importat els paràmetres. Es recomana reiniciar.', eu: 'Ezarpenak inportatu dira. Berrabiaraztea gomendatzen da.',
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
        ca: 'L’aplicació es reiniciarà per aplicar tots els canvis.', eu: 'Aplikazioa berrabiaraziko da aldaketa guztiak aplikatzeko.',
    },
    'dialog.import.error': {
        fr: 'Import échoué', en: 'Import failed', es: 'Error al importar',
        de: 'Import fehlgeschlagen', it: 'Importazione fallita', pt: 'Falha na importação',
        zh: '导入失败', ar: 'فشل الاستيراد',
        ca: 'Ha fallat la importació', eu: 'Eragiketak huts egin du',
    },
    'dialog.import.error.detail': {
        fr: 'Fichier invalide : {error}', en: 'Invalid file: {error}', es: 'Archivo inválido: {error}',
        de: 'Ungültige Datei: {error}', it: 'File non valido: {error}', pt: 'Arquivo inválido: {error}',
        zh: '无效文件：{error}', ar: 'ملف غير صالح: {error}',
        ca: 'Fitxer no vàlid: {error}', eu: 'Fitxategi baliogabea: {error}',
    },
    'dialog.addAccount.title': {
        fr: 'Ajouter un compte', en: 'Add account', es: 'Añadir cuenta',
        de: 'Konto hinzufügen', it: 'Aggiungi account', pt: 'Adicionar conta',
        zh: '添加账户', ar: 'إضافة حساب',
        ca: 'Afegeix un compte', eu: 'Gehitu kontua',
    },
    'dialog.addAccount.message': {
        fr: 'Ajouter un nouveau compte Outlook', en: 'Add a new Outlook account',
        es: 'Añadir una nueva cuenta de Outlook', de: 'Neues Outlook-Konto hinzufügen',
        it: 'Aggiungi un nuovo account Outlook', pt: 'Adicionar uma nova conta Outlook',
        zh: '添加新的 Outlook 账户', ar: 'إضافة حساب Outlook جديد',
        ca: 'Afegeix un compte nou de l’Outlook', eu: 'Gehitu Outlook kontu berri bat',
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
        ca: 'S\'afegirà un compte nou amb l\'URL predeterminat de l\'Outlook. Hauràs d’iniciar la sessió per separat a la finestra nova.', eu: 'Kontu berri bat gehituko da Outlook-en lehenetsitako URLarekin. Leiho berrian bereizita saioa hasi beharko duzu.',
    },
    'dialog.addAccount.confirm': {
        fr: 'Ajouter', en: 'Add', es: 'Añadir', de: 'Hinzufügen',
        it: 'Aggiungi', pt: 'Adicionar', zh: '添加', ar: 'إضافة',
        ca: 'Afegeix', eu: 'Gehitu',
    },
    'dialog.removeAccount.title': {
        fr: 'Supprimer le compte', en: 'Remove account', es: 'Eliminar cuenta',
        de: 'Konto entfernen', it: 'Rimuovi account', pt: 'Remover conta',
        zh: '删除账户', ar: 'حذف الحساب',
        ca: 'Elimina el compte', eu: 'Kendu kontua',
    },
    'dialog.removeAccount.message': {
        fr: 'Supprimer le compte « {name} » ?', en: 'Remove account "{name}"?',
        es: '¿Eliminar la cuenta "{name}"?', de: 'Konto „{name}" entfernen?',
        it: 'Rimuovere l\'account "{name}"?', pt: 'Remover a conta "{name}"?',
        zh: '删除账户“{name}”？', ar: 'حذف الحساب "{name}"؟',
        ca: 'Vols eliminar el compte «{name}»?', eu: '"{name}" kontua kendu nahi duzu?',
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
        ca: 'Se suprimiran les dades de la sessió d\'aquest compte. Hauràs de tornar a iniciar la sessió si el tornes a afegir més endavant.', eu: 'Kontu honen saio-datuak ezabatuko dira. Berriro saioa hasi beharko duzu geroago berriro gehitzen baduzu.',
    },
    'dialog.removeAccount.confirm': {
        fr: 'Supprimer', en: 'Remove', es: 'Eliminar', de: 'Entfernen',
        it: 'Rimuovi', pt: 'Remover', zh: '删除', ar: 'حذف',
        ca: 'Elimina', eu: 'Kendu',
    },
    'dialog.restore.title': {
        fr: 'Confirmer la restauration', en: 'Confirm Restore', es: 'Confirmar restauración',
        de: 'Wiederherstellung bestätigen', it: 'Conferma ripristino', pt: 'Confirmar restauração',
        zh: '确认恢复', ar: 'تأكيد الاستعادة',
        ca: 'Confirma la restauració', eu: 'Berretsi berrezartzea',
    },
    'dialog.restore.message': {
        fr: 'Restaurer tous les paramètres par défaut ?', en: 'Restore all settings to default values?',
        es: '¿Restaurar todos los ajustes a los valores predeterminados?', de: 'Alle Einstellungen auf Standardwerte zurücksetzen?',
        it: 'Ripristinare tutte le impostazioni ai valori predefiniti?', pt: 'Restaurar todas as configurações para os valores padrão?',
        zh: '将所有设置恢复为默认值？', ar: 'استعادة جميع الإعدادات إلى القيم الافتراضية؟',
        ca: 'Retorna a les preferències per defecte', eu: 'Ezarpen guztiak lehenetsitako balioetara berrezarri nahi al dituzu?',
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
        ca: 'Això restablirà tots els paràmetres als valors predeterminats de fàbrica, però conservarà les dades de l\'aplicació.', eu: 'Horrela, ezarpen guztiak beren lehenetsitako fabrikako balioetara leheneratuko dira, baina aplikazioaren datuak gorde egingo dira.',
    },
    'dialog.restore.confirm': {
        fr: 'Restaurer', en: 'Restore', es: 'Restaurar', de: 'Wiederherstellen',
        it: 'Ripristina', pt: 'Restaurar', zh: '恢复', ar: 'استعادة',
        ca: 'Restaura', eu: 'Berrezarri',
    },
    'dialog.reset.title': {
        fr: 'Confirmer la réinitialisation', en: 'Confirm Full Reset', es: 'Confirmar restablecimiento completo',
        de: 'Vollständiges Zurücksetzen bestätigen', it: 'Conferma ripristino completo', pt: 'Confirmar redefinição completa',
        zh: '确认完全重置', ar: 'تأكيد إعادة التعيين الكاملة',
        ca: 'Confirma el restabliment complet', eu: 'Berretsi berrezarpen osoa',
    },
    'dialog.reset.message': {
        fr: 'Effacer TOUTES les données de l\'application ?', en: 'Clear ALL application data?',
        es: '¿Borrar TODOS los datos de la aplicación?', de: 'ALLE Anwendungsdaten löschen?',
        it: 'Cancellare TUTTI i dati dell\'applicazione?', pt: 'Limpar TODOS os dados do aplicativo?',
        zh: '清除所有应用数据？', ar: 'مسح جميع بيانات التطبيق؟',
        ca: 'Vols esborrar TOTES les dades de l\'aplicació?', eu: 'Aplikazioaren DATU GUZTIAK ezabatu nahi al dituzu?',
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
        ca: 'Això suprimirà permanentment:\n- Tots els paràmetres\n- Els correus electrònics emmagatzemats a la memòria cau\n- Dades locals\n\nHauràs de tornar a iniciar la sessió.', eu: 'Honek behin betiko ezabatuko ditu:\n- Ezarpen guztiak\n- Cachean gordetako mezu elektronikoak\n- Tokiko datuak\n\nBerriro saioa hasi beharko duzu.',
    },
    'dialog.reset.confirm': {
        fr: 'Tout effacer', en: 'Reset Everything', es: 'Borrar todo', de: 'Alles löschen',
        it: 'Cancella tutto', pt: 'Limpar tudo', zh: '全部清除', ar: 'مسح الكل',
        ca: 'Reinicia-ho tot', eu: 'Berrezarri dena',
    },
    'dialog.reset.success.title': {
        fr: 'Réinitialisation terminée', en: 'Reset Complete', es: 'Restablecimiento completado',
        de: 'Zurücksetzen abgeschlossen', it: 'Ripristino completato', pt: 'Redefinição concluída',
        zh: '重置完成', ar: 'اكتمل إعادة التعيين',
        ca: 'S’ha completat el restabliment', eu: 'Berrezarpena osatuta',
    },
    'dialog.reset.success.message': {
        fr: 'Toutes les données ont été supprimées.', en: 'All app data has been deleted.',
        es: 'Todos los datos han sido eliminados.', de: 'Alle App-Daten wurden gelöscht.',
        it: 'Tutti i dati sono stati eliminati.', pt: 'Todos os dados foram eliminados.',
        zh: '所有应用数据已删除。', ar: 'تم حذف جميع بيانات التطبيق.',
        ca: 'S’han eliminat totes les dades de l’aplicació.', eu: 'Aplikazioaren datu guztiak ezabatu dira.',
    },
    'dialog.reset.success.detail': {
        fr: "L'application va maintenant se fermer.", en: 'The application will now close.',
        es: 'La aplicación se cerrará ahora.', de: 'Die Anwendung wird jetzt geschlossen.',
        it: "L'applicazione verrà chiusa.", pt: 'O aplicativo será fechado agora.',
        zh: '应用将关闭。', ar: 'سيتم إغلاق التطبيق الآن.',
        ca: 'L\'aplicació es tancarà ara.', eu: 'Aplikazioa itxiko da orain.',
    },

    // ===== Notifications =====
    'notif.newMessages.title': {
        fr: 'Nouveaux messages', en: 'New Messages', es: 'Nuevos mensajes',
        de: 'Neue Nachrichten', it: 'Nuovi messaggi', pt: 'Novas mensagens',
        zh: '新邮件', ar: 'رسائل جديدة',
        ca: 'Missatges nous', eu: 'Mezu berriak',
    },
    'notif.newMessages.body': {
        fr: '{count} message(s) non lu(s)', en: '{count} unread message(s)', es: '{count} mensaje(s) sin leer',
        de: '{count} ungelesene Nachricht(en)', it: '{count} messaggio/i non letto/i', pt: '{count} mensagem(ns) não lida(s)',
        zh: '{count} 封未读邮件', ar: '{count} رسالة غير مقروءة',
        ca: '{count} missatges no llegits', eu: '{count} mezu irakurri gabe',
    },
    'notif.newMail.title': {
        fr: 'Nouveau mail', en: 'New mail', es: 'Nuevo correo',
        de: 'Neue E-Mail', it: 'Nuova email', pt: 'Novo e-mail',
        zh: '新邮件', ar: 'بريد جديد',
        ca: 'Nou correu', eu: 'Posta Berria',
    },
    'notif.newMail.body': {
        fr: '{sender} : {subject}', en: '{sender}: {subject}', es: '{sender}: {subject}',
        de: '{sender}: {subject}', it: '{sender}: {subject}', pt: '{sender}: {subject}',
        zh: '{sender}：{subject}', ar: '{sender}: {subject}',
        ca: '{sender}: {subject}', eu: '{sender}: {subject}',
    },
    'notif.newMail.bodyNoSubject': {
        fr: '{sender} (pas de sujet)', en: '{sender} (no subject)', es: '{sender} (sin asunto)',
        de: '{sender} (kein Betreff)', it: '{sender} (nessun oggetto)', pt: '{sender} (sem assunto)',
        zh: '{sender}（无主题）', ar: '{sender} (بدون موضوع)',
        ca: '{sender} (sense assumpte)', eu: '{sender} (gairik gabe)',
    },
    'notif.calendar.title': {
        fr: '{count} rappel(s) calendrier', en: '{count} Calendar Reminder(s)', es: '{count} recordatorio(s) de calendario',
        de: '{count} Kalendererinnerung(en)', it: '{count} promemoria calendario', pt: '{count} lembrete(s) de calendário',
        zh: '{count} 条日历提醒', ar: '{count} تذكير/تذكيرات تقويم',
        ca: '{count} recordatoris del calendari', eu: '{count} egutegi-gogorarazpen',
    },
    'notif.offline.title': {
        fr: 'Connexion Internet perdue', en: 'Internet connection lost', es: 'Conexión a Internet perdida',
        de: 'Internetverbindung verloren', it: 'Connessione Internet persa', pt: 'Ligação à Internet perdida',
        zh: '互联网连接断开', ar: 'تم فقدان الاتصال بالإنترنت',
        ca: 'connexió a Internet', eu: 'Interneteko konexioa galdu da',
    },
    'notif.online.title': {
        fr: 'Connexion rétablie', en: 'Connection restored', es: 'Conexión restablecida',
        de: 'Verbindung wiederhergestellt', it: 'Connessione ripristinata', pt: 'Ligação restabelecida',
        zh: '连接已恢复', ar: 'تم استعادة الاتصال',
        ca: 'S’ha restablert la connexió', eu: 'Konexioa berrezarri da',
    },

    // ===== Splash =====
    'splash.loading': {
        fr: 'Chargement...', en: 'Loading...', es: 'Cargando...', de: 'Laden...',
        it: 'Caricamento...', pt: 'Carregando...', zh: '加载中...', ar: 'جارٍ التحميل...',
        ca: 'Carregant...', eu: 'Kargatzen...',
    },
    // v4.0.36: shown when the splash times out (30s) without the page loading
    'splash.timeout': {
        fr: 'Le chargement prend trop longtemps — merci de relancer UToutlook Mail',
        en: 'Loading is taking too long — please relaunch UToutlook Mail',
        es: 'La carga tarda demasiado — relanza UToutlook Mail',
        de: 'Laden dauert zu lange — bitte UToutlook Mail neu starten',
        it: 'Il caricamento richiede troppo tempo — riavvia UToutlook Mail',
        pt: 'O carregamento está a demorar demasiado — reinicia o UToutlook Mail',
        zh: '加载时间过长 — 请重新启动 UToutlook Mail',
        ar: 'التحميل يستغرق وقتاً طويلاً — يرجى إعادة تشغيل UToutlook Mail',
        ca: 'La càrrega està tardant massa. Torna a iniciar UToutlook Mail.', eu: 'Kargatzeak gehiegi tardatzen ari da — mesedez, abiarazi berriro UToutlook Mail',
    },
    'splash.relaunch': {
        fr: 'Merci de relancer UToutlook Mail', en: 'Please relaunch UToutlook Mail',
        es: 'Relanza UToutlook Mail', de: 'Bitte UToutlook Mail neu starten',
        it: 'Riavvia UToutlook Mail', pt: 'Reinicia o UToutlook Mail',
        zh: '请重新启动 UToutlook Mail', ar: 'أعد تشغيل UToutlook Mail',
        ca: 'Torneu a iniciar UToutlook Mail', eu: 'Mesedez, abiarazi berriro UToutlook Mail',
    },

    // ===== Offline page =====
    'offline.title': {
        fr: 'Pas de connexion', en: 'No connection', es: 'Sin conexión',
        de: 'Keine Verbindung', it: 'Nessuna connessione', pt: 'Sem ligação',
        zh: '无连接', ar: 'لا يوجد اتصال',
        ca: 'Sense connexió', eu: 'Konexiorik ez',
    },
    'empty.title': {
        fr: 'Aucun message', en: 'No messages', es: 'Sin mensajes',
        de: 'Keine Nachrichten', it: 'Nessun messaggio', pt: 'Sem mensagens',
        zh: '没有邮件', ar: 'لا توجد رسائل',
        ca: 'Cap missatge', eu: 'Mezuak',
    },
    'empty.body': {
        fr: 'Ce dossier est vide.', en: 'This folder is empty.', es: 'Esta carpeta está vacía.',
        de: 'Dieser Ordner ist leer.', it: 'Questa cartella è vuota.', pt: 'Esta pasta está vazia.',
        zh: '此文件夹为空。', ar: 'هذا المجلد فارغ.',
        ca: 'Aquesta carpeta és buida.', eu: 'Karpeta hau hutsik dago.',
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
        ca: 'UToutlook Mail no es pot connectar. Comproveu la connexió a internet.', eu: 'UToutlook Mailek ezin du konektatu. Egiaztatu Interneteko konexioa.',
    },
    'offline.retry': {
        fr: 'Réessayer', en: 'Retry', es: 'Reintentar', de: 'Erneut versuchen',
        it: 'Riprova', pt: 'Tentar novamente', zh: '重试', ar: 'إعادة المحاولة',
        ca: 'Tornar a intentar', eu: 'Berriro saiatu',
    },
    'offline.checking': {
        fr: 'Vérification...', en: 'Checking...', es: 'Comprobando...', de: 'Prüfen...',
        it: 'Verifica...', pt: 'Verificando...', zh: '检查中...', ar: 'جارٍ الفحص...',
        ca: 'S\'està comprovant...', eu: 'Egiaztatzen...',
    },
    'offline.connected': {
        fr: 'Connexion retrouvée !', en: 'Connection restored!', es: '¡Conexión restablecida!',
        de: 'Verbindung wiederhergestellt!', it: 'Connessione ripristinata!', pt: 'Ligação restabelecida!',
        zh: '连接已恢复！', ar: 'تم استعادة الاتصال!',
        ca: 'S\'ha restablert la connexió!', eu: 'Konexioa berrezarri da!',
    },
    'offline.autoReconnect': {
        fr: 'Reconnexion automatique...', en: 'Auto-reconnecting...', es: 'Reconexión automática...',
        de: 'Automatisch verbinden...', it: 'Riconnessione automatica...', pt: 'Reconectando automaticamente...',
        zh: '自动重连...', ar: 'إعادة الاتصال تلقائياً...',
        ca: 'S\'està tornant a connectar automàticament...', eu: 'Automatikoki berriro konektatzen...',
    },
    'notif.serverUnreachable.title': {
        fr: 'Serveur inaccessible', en: 'Server unreachable', es: 'Servidor inaccesible',
        de: 'Server nicht erreichbar', it: 'Server irraggiungibile', pt: 'Servidor inacessível',
        zh: '服务器无法访问', ar: 'الخادم غير قابل للوصول',
        ca: 'No es pot accedir al servidor', eu: 'Ezin da zerbitzarira iritsi',
    },
    'notif.serverReachable.title': {
        fr: 'Serveur à nouveau disponible', en: 'Server available again', es: 'Servidor disponible de nuevo',
        de: 'Server wieder verfügbar', it: 'Server di nuovo disponibile', pt: 'Servidor novamente disponível',
        zh: '服务器已恢复', ar: 'الخادم متاح مرة أخرى',
        ca: 'El servidor torna a estar disponible', eu: 'Zerbitzaria berriro erabilgarri dago',
    },

    // ===== Server not responding screen (v4.0.3) =====
    'server.title': {
        fr: 'Le serveur ne répond pas', en: 'Server not responding', es: 'El servidor no responde',
        de: 'Server antwortet nicht', it: 'Il server non risponde', pt: 'O servidor não responde',
        zh: '服务器无响应', ar: 'الخادم لا يستجيب',
        ca: 'El servidor no respon', eu: 'Zerbitzariak ez du erantzuten',
    },
    'server.message': {
        fr: 'UToutlook Mail ne parvient pas à joindre le serveur (la page de connexion n\'est pas disponible). Réessayez dans un instant.',
        en: 'UToutlook Mail cannot reach the server (the login page is unavailable). Please try again in a moment.',
        es: 'UToutlook Mail no puede contactar con el servidor (la página de inicio de sesión no está disponible). Inténtalo de nuevo en un momento.',
        de: 'UToutlook Mail kann den Server nicht erreichen (die Anmeldeseite ist nicht verfügbar). Versuche es in einem Moment erneut.',
        it: 'UToutlook Mail non riesce a raggiungere il server (la pagina di accesso non è disponibile). Riprova tra un momento.',
        pt: 'O UToutlook Mail não consegue contactar o servidor (a página de início de sessão não está disponível). Tente novamente dentro de um momento.',
        zh: 'UToutlook Mail 无法连接服务器（登录页面不可用）。请稍后重试。',
        ar: 'لا يمكن لـ UToutlook Mail الوصول إلى الخادم (صفحة تسجيل الدخول غير متاحة). حاول مرة أخرى بعد قليل.',
        ca: 'UToutlook Mail no pot accedir al servidor (la pàgina d\'inici de sessió no està disponible). Torna-ho a provar d\'aquí a un moment.', eu: 'UToutlook Mailek ezin du zerbitzarira konektatu (saio-hasierako orria ez dago erabilgarri). Saiatu berriro une bat barru.',
    },

    // ===== About =====
    'about.description': {
        fr: 'Client mail Outlook pour Ubuntu Touch', en: 'Outlook mail client for Ubuntu Touch',
        es: 'Cliente de correo Outlook para Ubuntu Touch', de: 'Outlook-Mail-Client für Ubuntu Touch',
        it: 'Client di posta Outlook per Ubuntu Touch', pt: 'Cliente de e-mail Outlook para Ubuntu Touch',
        zh: 'Ubuntu Touch 版 Outlook 邮件客户端', ar: 'عميل بريد Outlook لـ Ubuntu Touch',
        ca: 'Client de correu Outlook per a Ubuntu Touch', eu: 'Outlook posta-bezeroa Ubuntu Touch-erako',
    },
    'about.tagline': {
        fr: 'Human made, vibe verified', en: 'Human made, vibe verified', es: 'Human made, vibe verified',
        de: 'Human made, vibe verified', it: 'Human made, vibe verified', pt: 'Human made, vibe verified',
        zh: 'Human made, vibe verified', ar: 'Human made, vibe verified',
        ca: 'Human made, vibe verified', eu: 'Human made, vibe verified',
    },
    'about.basedOn': {
        // v4.1.0: crédit corrigé — inspiration, pas paternité (8 langues).
        fr: 'Inspiré de Julien Alarcon — basé sur Prospect Mail (MIT) adapté pour UBports',
        en: 'Inspired from Julien Alarcon — based on Prospect Mail (MIT) adapted for UBports',
        es: 'Inspirado en Julien Alarcon — basado en Prospect Mail (MIT) adaptado para UBports',
        de: 'Inspiriert von Julien Alarcon — basierend auf Prospect Mail (MIT) für UBports angepasst',
        it: 'Ispirato a Julien Alarcon — basato su Prospect Mail (MIT) adattato per UBports',
        pt: 'Inspirado em Julien Alarcon — baseado no Prospect Mail (MIT) adaptado para UBports',
        zh: '灵感来自 Julien Alarcon — 基于 Prospect Mail (MIT) 适配 UBports',
        ar: 'مستوحى من Julien Alarcon — مبني على Prospect Mail (MIT) معدّل لـ UBports',
        ca: 'Inspirat en Julien Alarcon — basat en Prospect Mail (MIT) adaptat per UBports', eu: 'Julien Alarconek inspiratuta — Prospect Mail (MIT) oinarrituta, UBports-era egokitua',
    },
    'observer.domChanged': {
        fr: 'DOM Outlook modifié — les sélecteurs de l’observer ne correspondent plus (non lus indisponibles)',
        en: 'Outlook page changed — the unread observer selectors no longer match',
        es: 'La página de Outlook cambió — los selectores ya no coinciden',
        de: 'Outlook-Seite geändert — die Beobachter-Selektoren passen nicht mehr',
        it: 'Pagina Outlook modificata — i selettori non corrispondono più',
        pt: 'Página do Outlook alterada — os seletores não correspondem mais',
        zh: 'Outlook 页面已更改 — 观察者选择器不再匹配',
        ar: 'تغيّرت صفحة Outlook — لم تعد محددات المراقب تطابق',
        ca: 'S’ha modificat la pàgina d’Outlook: els selectors d’observadors no llegits ja no coincideixen', eu: 'Ikuspegi-orria aldatu da — irakurri gabeko behatzaileen hautatzaileak jada ez datoz bat',
    },
    'notif.calendar.reminderFallback': {
        fr: 'Rappel', en: 'Reminder', es: 'Recordatorio', de: 'Erinnerung',
        it: 'Promemoria', pt: 'Lembrete', zh: '提醒', ar: 'تذكير',
        ca: 'Recordatori', eu: 'Oroigarria',
    },
    'notif.calendar.at': {
        fr: 'à', en: 'at', es: 'a las', de: 'um', it: 'alle', pt: 'às', zh: '于', ar: 'في',
        ca: 'a', eu: '/',
    },
    'notif.calendar.until': {
        fr: 'dans', en: 'in', es: 'en', de: 'in', it: 'tra', pt: 'em', zh: '还有', ar: 'بعد',
        ca: 'polçades', eu: 'hemen',
    },
    'notif.calendar.location': {
        fr: 'à', en: 'at', es: 'en', de: 'in', it: 'a', pt: 'em', zh: '地点', ar: 'في',
        ca: 'a', eu: '/',
    },
    'about.github': {
        fr: 'GitHub', en: 'GitHub', es: 'GitHub', de: 'GitHub',
        it: 'GitHub', pt: 'GitHub', zh: 'GitHub', ar: 'GitHub',
        ca: 'GitHub', eu: '<a href="%s" target="_blank">Github</a>',
    },
    'about.donate': {
        fr: 'Faire un don', en: 'Donate', es: 'Donar', de: 'Spenden',
        it: 'Dona', pt: 'Doar', zh: '捐赠', ar: 'تبرع',
        ca: 'Donar', eu: 'Berrizendatu...',
    },
    'about.version': {
        fr: 'Version', en: 'Version', es: 'Versión', de: 'Version',
        it: 'Versione', pt: 'Versão', zh: '版本', ar: 'الإصدار',
        ca: 'Versió', eu: 'Bertsioa',
    },
    'about.reportIssue': {
        fr: 'Signaler un problème', en: 'Report an issue', es: 'Informar de un problema',
        de: 'Problem melden', it: 'Segnala un problema', pt: 'Relatar um problema',
        zh: '报告问题', ar: 'الإبلاغ عن مشكلة',
        ca: 'Informa d\'un problema', eu: 'Jakinarazi arazo bat',
    },

    // ===== Account defaults =====
    'account.default': {
        fr: 'Compte principal', en: 'Primary account', es: 'Cuenta principal',
        de: 'Hauptkonto', it: 'Account principale', pt: 'Conta principal',
        zh: '主账户', ar: 'الحساب الرئيسي',
        ca: 'Compte principal', eu: 'Kontu nagusia',
    },
    'account.new': {
        fr: 'Compte {n}', en: 'Account {n}', es: 'Cuenta {n}',
        de: 'Konto {n}', it: 'Account {n}', pt: 'Conta {n}',
        zh: '账户 {n}', ar: 'حساب {n}',
        ca: 'Compte {n}', eu: '{n}. kontua',
    },

    // ===== Focus mode indicator =====
    'focus.indicator': {
        fr: 'Mode lecture', en: 'Focus mode', es: 'Modo lectura', de: 'Fokusmodus',
        it: 'Modalità lettura', pt: 'Modo leitura', zh: '专注模式', ar: 'وضع التركيز',
        ca: 'Mode de concentració', eu: 'Lasterbideen zerrendaren modua.',
    },

    // ===== Context menu =====
    'ctx.undo': {
        fr: 'Annuler', en: 'Undo', es: 'Deshacer', de: 'Rückgängig',
        it: 'Annulla', pt: 'Desfazer', zh: '撤销', ar: 'تراجع',
        ca: 'Desfés', eu: 'Desegin',
    },
    'ctx.redo': {
        fr: 'Rétablir', en: 'Redo', es: 'Rehacer', de: 'Wiederholen',
        it: 'Ripeti', pt: 'Refazer', zh: '重做', ar: 'إعادة',
        ca: 'Refés', eu: 'Berregin',
    },
    'ctx.cut': {
        fr: 'Couper', en: 'Cut', es: 'Cortar', de: 'Ausschneiden',
        it: 'Taglia', pt: 'Cortar', zh: '剪切', ar: 'قص',
        ca: 'Retalla', eu: 'Cutler',
    },
    'ctx.copy': {
        fr: 'Copier', en: 'Copy', es: 'Copiar', de: 'Kopieren',
        it: 'Copia', pt: 'Copiar', zh: '复制', ar: 'نسخ',
        ca: 'Copia', eu: 'Kopiatu',
    },
    'ctx.paste': {
        fr: 'Coller', en: 'Paste', es: 'Pegar', de: 'Einfügen',
        it: 'Incolla', pt: 'Colar', zh: '粘贴', ar: 'لصق',
        ca: 'Enganxa', eu: 'Itsatsi',
    },
    'ctx.selectAll': {
        fr: 'Tout sélectionner', en: 'Select All', es: 'Seleccionar todo',
        de: 'Alles auswählen', it: 'Seleziona tutto', pt: 'Selecionar tudo',
        zh: '全选', ar: 'تحديد الكل',
        ca: 'Seleccioneu-ho tot', eu: 'Aukeratu guztiak',
    },
    'ctx.openLink': {
        fr: 'Ouvrir le lien dans le navigateur', en: 'Open Link in Browser',
        es: 'Abrir enlace en el navegador', de: 'Link im Browser öffnen',
        it: 'Apri link nel browser', pt: 'Abrir link no navegador',
        zh: '在浏览器中打开链接', ar: 'فتح الرابط في المتصفح',
        ca: 'Obre al navegador', eu: 'Ireki esteka arakatzailean',
    },
    'ctx.copyLink': {
        fr: "Copier l'adresse du lien", en: 'Copy Link Address',
        es: 'Copiar dirección del enlace', de: 'Linkadresse kopieren',
        it: 'Copia indirizzo link', pt: 'Copiar endereço do link',
        zh: '复制链接地址', ar: 'نسخ عنوان الرابط',
        ca: 'Copia l\' adreça d\' enllaç', eu: 'Kopiatu estekaren helbidea',
    },
    'ctx.inspect': {
        fr: "Inspecter l'élément", en: 'Inspect Element',
        es: 'Inspeccionar elemento', de: 'Element untersuchen',
        it: 'Ispeziona elemento', pt: 'Inspecionar elemento',
        zh: '检查元素', ar: 'فحص العنصر',
        ca: 'Inspecciona l’element', eu: 'Aztertu _elementua',
    },

    // ===== Shell notifications =====
    'shell.welcome': {
        // v4.2.8: message de démarrage — l'utilisateur doit savoir que l'app
        // démarre (fenêtre parfois lente à apparaître sur device).
        fr: 'UToutlook Mail démarre, veuillez patienter…', en: 'UToutlook Mail is starting, please wait…',
        es: 'UToutlook Mail se está iniciando, espere…', de: 'UToutlook Mail wird gestartet, bitte warten…',
        it: 'UToutlook Mail si sta avviando, attendere…', pt: 'UToutlook Mail está a iniciar, aguarde…',
        zh: 'UToutlook Mail 正在启动，请稍候…', ar: 'جارٍ بدء UToutlook Mail، يرجى الانتظار…',
        ca: 'UToutlook Mail s\'està iniciant, espereu…', eu: 'UToutlook Mail abiarazten ari da, itxaron...',
    },
    'shell.waitClose': {
        fr: 'Veuillez attendre la fermeture d\'UToutlook', en: 'Please wait for UToutlook to close',
        es: 'Espera a que UToutlook se cierre', de: 'Bitte warte, bis UToutlook geschlossen wird',
        it: 'Attendi la chiusura di UToutlook', pt: 'Aguarde o fecho do UToutlook',
        zh: '请等待 UToutlook 关闭', ar: 'الرجاء الانتظار حتى يغلق UToutlook',
        ca: 'Espereu que es tanqui UToutlook', eu: 'Itxaron UToutlook itxi arte',
    },
    'shell.cleaning': {
        fr: 'Nettoyage d\'UToutlook Mail', en: 'Cleaning UToutlook Mail',
        es: 'Limpiando UToutlook Mail', de: 'UToutlook Mail wird bereinigt',
        it: 'Pulizia di UToutlook Mail', pt: 'Limpando UToutlook Mail',
        zh: '正在清理 UToutlook Mail', ar: 'جارٍ تنظيف UToutlook Mail',
        ca: 'Neteja del correu d’Outlook UT', eu: 'UToutlook Posta garbitzen',
    },
    'shell.noNetwork': {
        fr: 'Pas d\'accès réseau... fermeture', en: 'No network access... quitting',
        es: 'Sin acceso a la red... cerrando', de: 'Kein Netzwerkzugriff... wird beendet',
        it: 'Nessun accesso di rete... chiusura', pt: 'Sem acesso à rede... a encerrar',
        zh: '无网络访问...正在退出', ar: 'لا يوجد وصول للشبكة... جارٍ الخروج',
        ca: 'No hi ha accés a la xarxa... s\'està tancant', eu: 'Ez dago sare-sarbererik... ixten',
    },
    'shell.goodbye': {
        fr: 'Au revoir UToutlook Mail !', en: 'Goodbye UToutlook Mail!',
        es: '¡Adiós UToutlook Mail!', de: 'Auf Wiedersehen UToutlook Mail!',
        it: 'Arrivederci UToutlook Mail!', pt: 'Adeus UToutlook Mail!',
        zh: '再见 UToutlook Mail！', ar: 'وداعاً UToutlook Mail!',
        ca: 'Adéu, UToutlook Mail!', eu: 'Agur UToutlook Mail!',
    },
    'shell.resetDone': {
        fr: 'Réinitialisation effectuée... lancez UToutlook Mail', en: 'Reset done... launch UToutlook Mail',
        es: 'Restablecimiento hecho... inicia UToutlook Mail', de: 'Zurücksetzen erledigt... starte UToutlook Mail',
        it: 'Ripristino completato... avvia UToutlook Mail', pt: 'Redefinição concluída... inicie o UToutlook Mail',
        zh: '重置完成...请启动 UToutlook Mail', ar: 'اكتمل إعادة التعيين... شغّل UToutlook Mail',
        ca: 'S\'ha completat el restabliment... Inicieu UToutlook Mail', eu: 'Berrezarpena eginda... abiarazi UToutlook Mail',
    },
    // v4.0.25: shown while the wrapper waits for a dying old process to exit
    'shell.waitingClose': {
        fr: 'En attente de fermeture d’UToutlook…', en: 'Waiting for UToutlook to close…',
        es: 'Esperando a que UToutlook cierre…', de: 'Warte auf Schließen von UToutlook…',
        it: 'In attesa della chiusura di UToutlook…', pt: 'A aguardar o fecho do UToutlook…',
        zh: '等待 UToutlook 关闭…', ar: 'في انتظار إغلاق UToutlook…',
        ca: 'S’està esperant que es tanqui l’UToutlook…', eu: 'UToutlook itxi arte itxaroten...',
    },
    // v4.0.28: shown while the wrapper waits for the single-wrapper lock
    'shell.pleaseWait': {
        fr: 'Merci de patienter…', en: 'Please wait…',
        es: 'Espera un momento…', de: 'Bitte warten…',
        it: 'Attendere prego…', pt: 'Aguarde um momento…',
        zh: '请稍候…', ar: 'الرجاء الانتظار…',
        ca: 'Espereu…', eu: 'itxaron...',
    },
};

/**
 * v4.3.7: couverture des catalogues — nombre de clés réellement traduites
 * dans chaque langue. Sert de test de non-régression i18n (10 langues).
 * @returns {Object} Map lang code → number of translated keys
 */
export function getTranslationCoverage() {
    const result = {};
    for (const lang of Object.keys(LANGUAGES)) result[lang] = 0;
    for (const entry of Object.values(T)) {
        for (const lang of Object.keys(result)) {
            const value = entry[lang];
            if (typeof value === 'string' && value.length > 0) result[lang] += 1;
        }
    }
    return result;
}

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

