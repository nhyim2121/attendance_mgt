/** 인력계획 자료 모양 (설정 hr_plans · hr_capacity) */
export interface HirePlan { id: string; title: string; dept: string; n: number; why: string; when: string; stage: number; created: string }
export const PLAN_STAGES = ["충원 요청", "대표 승인", "채용공고", "채용 완료"];
