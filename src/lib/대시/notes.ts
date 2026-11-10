/** 통합 대시보드의 '할 일 4칸'과 '메모': 로그인한 사람마다 따로 (settings 표, 키 dash_todo4:<사용자>·dash_memo:<사용자>). 서버 전용. */
import "server-only";
import { getSetting, setSetting } from "../store";

/** 할 일 4칸: q = 1 급하고 중요 · 2 중요·안 급함 · 3 급함·안 중요 · 4 미뤄도 됨 */
export type Quad = 1 | 2 | 3 | 4;
export interface Todo4 { id: string; text: string; q: Quad; done: boolean }
export interface Memo { id: string; text: string; star: boolean }

export const QUAD_LABEL: Record<Quad, string> = { 1: "급하고 중요", 2: "중요·안 급함", 3: "급함·안 중요", 4: "미뤄도 됨" };
export const isQuad = (n: number): n is Quad => n === 1 || n === 2 || n === 3 || n === 4;

export const loadTodo4 = (userId: string) => getSetting<Todo4[]>(`dash_todo4:${userId}`, []);
export const saveTodo4 = (userId: string, list: Todo4[]) => setSetting(`dash_todo4:${userId}`, list);
export const loadMemos = (userId: string) => getSetting<Memo[]>(`dash_memo:${userId}`, []);
export const saveMemos = (userId: string, list: Memo[]) => setSetting(`dash_memo:${userId}`, list);

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
