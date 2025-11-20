<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<button
	class="_button"
	:class="[$style.root, { [$style.wait]: wait, [$style.active]: isFollowing || hasPendingFollowRequestFromYou, [$style.full]: full, [$style.large]: large }]"
	:disabled="wait"
	@click="onClick"
>
	<template v-if="!wait">
		<template v-if="hasPendingFollowRequestFromYou && user.isLocked">
			<span v-if="full" :class="$style.text">{{ i18n.ts.followRequestPending }}</span><i class="ti ti-hourglass-empty"></i>
		</template>
		<template v-else-if="hasPendingFollowRequestFromYou && !user.isLocked">
			<!-- つまりリモートフォローの場合。 -->
			<span v-if="full" :class="$style.text">{{ i18n.ts.processing }}</span><MkLoading :em="true" :colored="false"/>
		</template>
		<template v-else-if="isFollowing">
			<span v-if="full" :class="$style.text">{{ i18n.ts.youFollowing }}</span><i class="ti ti-minus"></i>
		</template>
		<template v-else-if="!isFollowing && user.isLocked">
			<span v-if="full" :class="$style.text">{{ i18n.ts.followRequest }}</span><i class="ti ti-plus"></i>
		</template>
        <template v-else-if="!isFollowing && !user.isLocked">
            <span v-if="full" :class="$style.text">{{ followLabel }}</span><i class="ti ti-plus"></i>
        </template>
	</template>
	<template v-else>
		<span v-if="full" :class="$style.text">{{ i18n.ts.processing }}</span><MkLoading :em="true" :colored="false"/>
	</template>
</button>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { host } from '@@/js/config.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useStream } from '@/stream.js';
import { i18n } from '@/i18n.js';
import { claimAchievement } from '@/utility/achievements.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { $i } from '@/i.js';
import { prefer } from '@/preferences.js';
import { haptic } from '@/utility/haptic.js';
import { computed } from 'vue';

const props = withDefaults(defineProps<{
	user: Misskey.entities.UserDetailed,
	full?: boolean,
	large?: boolean,
}>(), {
	full: false,
	large: false,
});

const emit = defineEmits<{
    (_: 'update:user', value: Misskey.entities.UserDetailed): void
}>();

const isFollowing = ref(props.user.isFollowing);
const hasPendingFollowRequestFromYou = ref(props.user.hasPendingFollowRequestFromYou);
const wait = ref(false);
const connection = useStream().useChannel('main');

const followPriceVnd = computed(() => {
    const raw = (props.user as any)?.followPriceAmountVnd ?? (props.user as any)?.followPriceMonthly ?? 0;
    const price = Number(raw);
    return Number.isFinite(price) ? price : 0;
});

const followLabel = computed(() => {
    return followPriceVnd.value > 0
        ? `Follow — ${followPriceVnd.value.toLocaleString('vi-VN')}₫/30d`
        : i18n.ts.follow;
});

if (props.user.isFollowing == null && $i) {
	misskeyApi('users/show', {
		userId: props.user.id,
	})
		.then(onFollowChange);
}

function onFollowChange(user: Misskey.entities.UserDetailed) {
	if (user.id === props.user.id) {
		isFollowing.value = user.isFollowing;
		hasPendingFollowRequestFromYou.value = user.hasPendingFollowRequestFromYou;
	}
}

async function onClick() {
	pleaseLogin({ openOnRemote: { type: 'web', path: `/@${props.user.username}@${props.user.host ?? host}` } });

	wait.value = true;

	haptic();

    try {
        if (isFollowing.value) {
			const { canceled } = await os.confirm({
				type: 'warning',
				text: i18n.tsx.unfollowConfirm({ name: props.user.name || props.user.username }),
			});

			if (canceled) {
				wait.value = false;
				return;
			}

			await misskeyApi('following/delete', {
				userId: props.user.id,
			});
		} else {
			if (prefer.s.alwaysConfirmFollow) {
				const { canceled } = await os.confirm({
					type: 'question',
					text: i18n.tsx.followConfirm({ name: props.user.name || props.user.username }),
				});

				if (canceled) {
					wait.value = false;
					return;
				}
			}

            if (hasPendingFollowRequestFromYou.value) {
                await misskeyApi('following/requests/cancel', {
                    userId: props.user.id,
                });
                hasPendingFollowRequestFromYou.value = false;
            } else {
                // If target requires paid follow, show SePay QR and allow input code after payment
                if (followPriceVnd.value > 0) {
                    try {
                        const r = await misskeyApi('following/sepay-qr', { userId: props.user.id });
                        const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkSepayQrDialog.vue').then(x => x.default), {
                            user: props.user,
                            qrDataUrl: r.qrUrl,
                            amountVnd: r.amountVnd,
                        }, {
                            closed: () => dispose(),
                        });
                    } catch (err) {
                        const code = (err as any)?.code ?? (err as any)?.response?.data?.error?.code;
                        if (code === 'SEPAY_CONFIG_MISSING') {
                            await os.alert({ type: 'warning', text: 'Chưa cấu hình SePay. Vui lòng liên hệ quản trị viên.' });
                        } else if (code === 'SEPAY_QR_CONFIG_MISSING') {
                            await os.alert({ type: 'warning', text: 'Thiếu cấu hình tài khoản/bank cho QR SePay. Vui lòng liên hệ quản trị viên.' });
                        } else if (code === 'PRICE_NOT_SET') {
                            await os.alert({ type: 'warning', text: 'Tài khoản này chưa thiết lập giá theo dõi.' });
                        }
                    }
                } else {
                    await misskeyApi('following/create', {
                        userId: props.user.id,
                        withReplies: prefer.s.defaultFollowWithReplies,
                    });
                    emit('update:user', {
                        ...props.user,
                        withReplies: prefer.s.defaultFollowWithReplies,
                    });
                    hasPendingFollowRequestFromYou.value = true;
                }

                if ($i == null) {
                    wait.value = false;
                    return;
                }

				claimAchievement('following1');

				if ($i.followingCount >= 10) {
					claimAchievement('following10');
				}
				if ($i.followingCount >= 50) {
					claimAchievement('following50');
				}
				if ($i.followingCount >= 100) {
					claimAchievement('following100');
				}
				if ($i.followingCount >= 300) {
					claimAchievement('following300');
				}
            }
        }
} catch (err) {
    const code = (err as any)?.code ?? (err as any)?.response?.data?.error?.code;
    if (code === 'PAID_FOLLOW_REQUIRED' && followPriceVnd.value > 0) {
        const r = await misskeyApi('following/sepay-qr', { userId: props.user.id });
        const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkSepayQrDialog.vue').then(x => x.default), {
            user: props.user,
            qrDataUrl: r.qrUrl,
            amountVnd: r.amountVnd,
        }, {
            closed: () => dispose(),
        });
        wait.value = false;
        return;
    }
    console.error(err);
    } finally {
        wait.value = false;
    }
}

onMounted(() => {
	connection.on('follow', onFollowChange);
	connection.on('unfollow', onFollowChange);
});

onBeforeUnmount(() => {
	connection.dispose();
});
</script>

<style lang="scss" module>
.root {
	position: relative;
	display: inline-block;
	font-weight: bold;
	color: var(--MI_THEME-fgOnWhite);
	border: solid 1px var(--MI_THEME-accent);
	padding: 0;
	height: 31px;
	font-size: 16px;
	border-radius: 32px;
	background: #fff;

	&.full {
		padding: 0 8px 0 12px;
		font-size: 14px;
	}

	&.large {
		font-size: 16px;
		height: 38px;
		padding: 0 12px 0 16px;
	}

	&:not(.full) {
		width: 31px;
	}

	&:focus-visible {
		outline-offset: 2px;
	}

	&:hover {
		//background: mix($primary, #fff, 20);
	}

	&:active {
		//background: mix($primary, #fff, 40);
	}

	&.active {
		color: var(--MI_THEME-fgOnAccent);
		background: var(--MI_THEME-accent);

		&:hover {
			background: hsl(from var(--MI_THEME-accent) h s calc(l + 10));
			border-color: hsl(from var(--MI_THEME-accent) h s calc(l + 10));
		}

		&:active {
			background: hsl(from var(--MI_THEME-accent) h s calc(l - 10));
			border-color: hsl(from var(--MI_THEME-accent) h s calc(l - 10));
		}
	}

	&.wait {
		cursor: wait !important;
		opacity: 0.7;
	}
}

.text {
	margin-right: 6px;
}
</style>
