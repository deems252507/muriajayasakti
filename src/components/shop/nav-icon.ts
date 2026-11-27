import {
  ArrowLeftRight,
  Banknote,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Coins,
  History,
  MessageCircle,
  PackageCheck,
  PackagePlus,
  PackageX,
  Receipt,
  RefreshCw,
  ScrollText,
  Settings,
  ShoppingCart,
  TrendingUp,
  TriangleAlert,
  Undo2,
  Wallet,
} from "lucide-react";
import { WhatsappLineIcon } from "@/components/shop/whatsapp-icon";

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
  [WhatsappLineIcon, "tilt"],
  [ScrollText, "hop"],
  [TrendingUp, "rise"],
  [Coins, "hop"],
  [RefreshCw, "cw"],
  [Banknote, "hop"],
  [TriangleAlert, "wiggle"],
  [PackageX, "wiggle"],
  [PackagePlus, "hop"],
  [PackageCheck, "pop"],
  [Receipt, "pop"],
]);

export function iconAnim(icon: unknown): string {
  return `mjs-ico mjs-i-${ANIM.get(icon) ?? "pop"}`;
}
