import {
  ArrowLeftRight,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Coins,
  History,
  MessageCircle,
  RefreshCw,
  ScrollText,
  Settings,
  ShoppingCart,
  TrendingUp,
  Undo2,
  Wallet,
} from "lucide-react";

// Animasi hover ikon (gaya AnimateIcons, murni CSS: tanpa paket tambahan). Keyframes ada di styles.css.
// Ikon yang tidak terdaftar memakai "pop". Parent ikon harus punya class `group`.
const ANIM = new Map<unknown, string>([
  [ShoppingCart, "nudge"],
  [Undo2, "undo"],
  [Wallet, "hop"],
  [ArrowLeftRight, "swap"],
  [History, "ccw"],
  [ClipboardList, "wiggle"],
  [ClipboardCheck, "wiggle"],
  [CalendarDays, "wiggle"],
  [Settings, "cog"],
  [MessageCircle, "tilt"],
  [ScrollText, "hop"],
  [TrendingUp, "rise"],
  [Coins, "hop"],
  [RefreshCw, "cw"],
]);

export function iconAnim(icon: unknown): string {
  return `mjs-ico mjs-i-${ANIM.get(icon) ?? "pop"}`;
}
