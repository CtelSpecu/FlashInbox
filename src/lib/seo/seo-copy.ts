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
      titleHome: '临时邮箱',
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
      titleHome: '臨時郵箱',
      descriptionHome:
        '匿名建立臨時郵箱並接收郵件，不儲存附件。支援認領取得 Key，並透過 username + key 恢復存取。',
      keywordsHome: ['臨時郵箱', '一次性郵箱', '臨時郵件', '匿名郵箱', '驗證碼郵箱'],
      titleClaim: '認領郵箱',
      descriptionClaim: '對未認領郵箱執行認領並取得 Key，Key 僅顯示一次，請務必保存。',
      titleRecover: '恢復存取',
      descriptionRecover: '使用 username + key（以及網域）恢復對郵箱的存取，並進入收件箱。',
    };
  }
  return {
    titleHome: 'Temporary Email',
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
  return 'en_US';
}
