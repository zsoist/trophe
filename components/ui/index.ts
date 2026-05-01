/**
 * Trophē v0.3 UI primitives — barrel export.
 *
 * One import surface for all design-system primitives:
 *
 *   import { Card, CardGold, Tag, BtnGold, BrandEye, Tabs, Fab } from '@/components/ui';
 *
 * Anything screen-specific (e.g. <ClientDashboardHero>) goes in
 * `components/<feature>/`, NOT here. This barrel stays small on purpose —
 * the smallest reusable building blocks every redesigned screen composes from.
 */

export { Card, CardGold, CardDanger } from './Card';
export { Tag } from './Tag';
export { BrandEye, MonoLabel, SectionTitle, Wordmark, BrandWordmark, BrandMark, BrandMono, BrandLockup } from './Brand';
export { Icon } from './Icon';
export type { IconName } from './Icon';
export { BtnGold, BtnGhost } from './Button';
export { Tabs } from './Tabs';
export type { TabOption } from './Tabs';
export { Fab } from './Fab';
export { BotNav } from './BotNav';
export type { BotNavRoute } from './BotNav';
export { StatusDot } from './StatusDot';
export { Avatar } from './Avatar';
