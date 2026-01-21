'use client';

import { Icon } from '@iconify/react';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Icon icon="mdi:email-fast" className="mx-auto h-16 w-16 text-indigo-600" />
          <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">FlashInbox</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Temporary email service - no registration required
          </p>
        </div>

        <div className="space-y-4">
          <mdui-text-field
            label="Username"
            placeholder="Enter or generate randomly"
            clearable
          >
            <mdui-icon slot="icon" name="account_circle"></mdui-icon>
          </mdui-text-field>

          <mdui-select label="Domain" value="example.com">
            <mdui-menu-item value="example.com">@example.com</mdui-menu-item>
          </mdui-select>

          <div className="flex gap-3">
            <mdui-button variant="tonal" className="flex-1">
              <Icon icon="mdi:dice-multiple" slot="icon" />
              Random
            </mdui-button>
            <mdui-button variant="filled" className="flex-1">
              <Icon icon="mdi:inbox-arrow-down" slot="icon" />
              Create
            </mdui-button>
          </div>
        </div>

        <div className="flex justify-center gap-4 pt-4">
          <mdui-button-icon>
            <Icon icon="mdi:key" />
          </mdui-button-icon>
          <mdui-button-icon>
            <Icon icon="mdi:history" />
          </mdui-button-icon>
        </div>
      </div>
    </div>
  );
}
