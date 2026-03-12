import type { Locale } from '@/lib/i18n';

export function getSeoCopy(locale: Locale): {
  titleHome: string;
  descriptionHome: string;
  keywordsHome: string[];
  titleClaim: string;
  descriptionClaim: string;
  titleRecover: string;
  descriptionRecover: string;
} {
  if (locale === 'zh-CN') {
    return {
      titleHome: '闪收箱临时邮箱',
      descriptionHome:
        '匿名创建临时邮箱并接收邮件，不存储附件。支持认领获取 Key，并通过 username + key 恢复访问。',
      keywordsHome: ['临时邮箱', '一次性邮箱', '临时邮件', '匿名邮箱', '验证码邮箱'],
      titleClaim: '认领邮箱',
      descriptionClaim: '对未认领邮箱执行认领并获取 Key，Key 仅展示一次，请及时保存。',
      titleRecover: '恢复访问',
      descriptionRecover: '使用 username + key（以及域名）恢复对邮箱的访问，并进入收件箱。',
    };
  }
  if (locale === 'zh-TW') {
    return {
      titleHome: '閃收箱臨時郵箱',
      descriptionHome:
        '匿名建立臨時郵箱並接收郵件，不儲存附件。支援認領取得 Key，並透過 username + key 恢復存取。',
      keywordsHome: ['臨時郵箱', '一次性郵箱', '臨時郵件', '匿名郵箱', '驗證碼郵箱'],
      titleClaim: '認領郵箱',
      descriptionClaim: '對未認領郵箱執行認領並取得 Key，Key 僅顯示一次，請務必保存。',
      titleRecover: '恢復存取',
      descriptionRecover: '使用 username + key（以及網域）恢復對郵箱的存取，並進入收件箱。',
    };
  }
  if (locale === 'fr-FR') {
    return {
      titleHome: "Service d'e-mail temporaire gratuit et open source",
      descriptionHome:
        "Créez anonymement une boîte mail temporaire et recevez des e-mails sans pièces jointes. Réclamez une clé et récupérez l'accès avec nom d'utilisateur + clé.",
      keywordsHome: ['email temporaire', 'email jetable', 'boîte temporaire', 'boîte anonyme'],
      titleClaim: 'Réclamer la boîte',
      descriptionClaim:
        'Réclamez une boîte non réclamée et obtenez une clé à usage unique. Enregistrez-la avant de fermer.',
      titleRecover: "Récupérer l'accès",
      descriptionRecover:
        "Restaurez l'accès à la boîte avec nom d'utilisateur + clé (et domaine), puis ouvrez la boîte de réception.",
    };
  }
  if (locale === 'de-DE') {
    return {
      titleHome: 'Kostenloser Open-Source-Dienst für temporäre E-Mails',
      descriptionHome:
        'Erstellen Sie anonym ein temporäres Postfach und empfangen Sie E-Mails ohne Anhänge. Beanspruchen Sie einen Schlüssel und stellen Sie den Zugriff mit Benutzername + Schlüssel wieder her.',
      keywordsHome: ['temporäre E-Mail', 'Wegwerf-E-Mail', 'temporäres Postfach', 'anonymer Posteingang'],
      titleClaim: 'Postfach beanspruchen',
      descriptionClaim:
        'Beanspruchen Sie ein unbeanspruchtes Postfach und erhalten Sie einen einmaligen Schlüssel. Speichern Sie ihn vor dem Schließen.',
      titleRecover: 'Zugriff wiederherstellen',
      descriptionRecover:
        'Stellen Sie den Postfachzugriff mit Benutzername + Schlüssel (und Domain) wieder her und öffnen Sie dann den Posteingang.',
    };
  }
  if (locale === 'es-ES') {
    return {
      titleHome: 'Servicio de correo temporal gratuito y de código abierto',
      descriptionHome:
        'Crea un buzón temporal de forma anónima y recibe correos sin archivos adjuntos. Reclama una clave y recupera el acceso con nombre de usuario + clave.',
      keywordsHome: ['correo temporal', 'correo desechable', 'buzón temporal', 'bandeja anónima'],
      titleClaim: 'Reclamar buzón',
      descriptionClaim:
        'Reclama un buzón no reclamado y obtén una clave de un solo uso. Guárdala antes de cerrar.',
      titleRecover: 'Recuperar acceso',
      descriptionRecover:
        'Recupera el acceso al buzón con nombre de usuario + clave (y dominio) y luego entra en la bandeja.',
    };
  }
  if (locale === 'ja-JP') {
    return {
      titleHome: '無料のオープンソース一時メールサービス',
      descriptionHome:
        '匿名で一時メールボックスを作成し、添付ファイルなしでメールを受信できます。キーを取得し、ユーザー名 + キーでアクセスを復元できます。',
      keywordsHome: ['一時メール', '使い捨てメール', 'テンポラリメール', '匿名受信箱'],
      titleClaim: 'メールボックスを claim',
      descriptionClaim:
        '未 claim のメールボックスを claim して一度きりのキーを取得します。閉じる前に保存してください。',
      titleRecover: 'アクセスを復元',
      descriptionRecover:
        'ユーザー名 + キー（およびドメイン）でメールボックスへのアクセスを復元し、受信箱を開きます。',
    };
  }
  return {
    titleHome: 'Free and Open Source Temporary Email Service',
    descriptionHome:
      'Create a temporary inbox anonymously and receive emails with no attachments. Claim a Key and recover access with username + key.',
    keywordsHome: ['temporary email', 'disposable email', 'temp mailbox', 'anonymous inbox'],
    titleClaim: 'Claim Inbox',
    descriptionClaim: 'Claim an unclaimed inbox and get a one-time Key. Save it before closing.',
    titleRecover: 'Recover Access',
    descriptionRecover: 'Recover inbox access using username + key (and domain), then enter the inbox.',
  };
}

export function getOgLocale(locale: Locale): string {
  if (locale === 'zh-CN') return 'zh_CN';
  if (locale === 'zh-TW') return 'zh_TW';
  if (locale === 'fr-FR') return 'fr_FR';
  if (locale === 'de-DE') return 'de_DE';
  if (locale === 'es-ES') return 'es_ES';
  if (locale === 'ja-JP') return 'ja_JP';
  return 'en_US';
}

export function getHomeMetaTitle(locale: Locale): string {
  if (locale === 'zh-CN') return '闪收箱临时邮箱 | FlashInBox';
  if (locale === 'zh-TW') return '閃收箱臨時郵箱 | FlashInBox';
  if (locale === 'fr-FR') return "FlashInBox | Service d'e-mail temporaire gratuit et open source";
  if (locale === 'de-DE') return 'FlashInBox | Kostenloser Open-Source-Dienst für temporäre E-Mails';
  if (locale === 'es-ES') return 'FlashInBox | Servicio de correo temporal gratuito y de código abierto';
  if (locale === 'ja-JP') return 'FlashInBox | 無料のオープンソース一時メールサービス';
  return 'FlashInBox | Free and Open Source Temporary Email Service';
}
