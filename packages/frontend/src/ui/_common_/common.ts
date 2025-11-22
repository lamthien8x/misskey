/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent } from 'vue';
import { host } from '@@/js/config.js';
import type { MenuItem } from '@/types/menu.js';
import * as os from '@/os.js';
import { instance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';

function toolsMenuItems(): MenuItem[] {
	const items: MenuItem[] = [{
		type: 'link',
		to: '/scratchpad',
		text: i18n.ts.scratchpad,
		icon: 'ti ti-terminal-2',
	}, {
		type: 'link',
		to: '/api-console',
		text: 'API Console',
		icon: 'ti ti-terminal-2',
	}, {
		type: 'link',
		to: '/clicker',
		text: '🍪👈',
		icon: 'ti ti-cookie',
	}];

	if ($i && ($i.isAdmin || $i.policies.canManageCustomEmojis)) {
		items.push({
			type: 'link',
			to: '/custom-emojis-manager',
			text: i18n.ts.manageCustomEmojis,
			icon: 'ti ti-icons',
		});
	}

	if ($i && ($i.isAdmin || $i.policies.canManageAvatarDecorations)) {
		items.push({
			type: 'link' as const,
			to: '/avatar-decorations',
			text: i18n.ts.manageAvatarDecorations,
			icon: 'ti ti-sparkles',
		});
	}

	return items;
}

export function openInstanceMenu(ev: MouseEvent) {
	const menuItems: MenuItem[] = [];

	menuItems.push({
		type: 'link',
		text: i18n.ts.inquiry,
		icon: 'ti ti-help-circle',
		to: '/contact',
	});

	if (instance.impressumUrl) {
		menuItems.push({
			type: 'a',
			text: i18n.ts.impressum,
			icon: 'ti ti-file-invoice',
			href: instance.impressumUrl,
			target: '_blank',
		});
	}

	if (instance.tosUrl) {
		menuItems.push({
			type: 'a',
			text: i18n.ts.termsOfService,
			icon: 'ti ti-notebook',
			href: instance.tosUrl,
			target: '_blank',
		});
	}

	if (instance.privacyPolicyUrl) {
		menuItems.push({
			type: 'a',
			text: i18n.ts.privacyPolicy,
			icon: 'ti ti-shield-lock',
			href: instance.privacyPolicyUrl,
			target: '_blank',
		});
	}

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target, {
		align: 'left',
	});
}

export function openToolsMenu(ev: MouseEvent) {
	os.popupMenu(toolsMenuItems(), ev.currentTarget ?? ev.target, {
		align: 'left',
	});
}
