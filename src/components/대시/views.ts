/** 서버에서 모은 할 일을 화면용으로 바꾼다 */
import { ddayText, ddayTone, type Todo } from "@/lib/대시/data";
import { emojiOf, menuOf } from "@/lib/대시/menu";
import type { TodoView } from "./client";

export const toViews = (list: Todo[]): TodoView[] => list.map((t) => ({
  cat: t.cat, icon: emojiOf(t.icon), title: t.title, sub: t.sub, href: t.href,
  dday: ddayText(t.left), tone: ddayTone(t.left), color: menuOf(t.area).color,
}));
